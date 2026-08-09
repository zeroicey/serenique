import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array, parseAuthenticatorData } from "@simplewebauthn/server/helpers";
import { db } from "@/db/connection";
import { env } from "@/env";
import { fireAuditRecord } from "@/modules/audit/audit.service";
import { passkeyCredentials, users } from "@/modules/auth/auth.schema";
import { toCredentialEntry, toUserEntry } from "@/modules/auth/auth.mappers";
import {
  CHALLENGE_TTL_MS,
  DEFAULT_SESSION_TTL_SECONDS,
  evaluateRegisterGate,
  evaluateSeedGate,
  signSessionCookie,
  throttleRecordFailure,
  throttleShouldBlock,
  verifySessionCookie,
  type SessionVerifyResult,
  type ThrottleState,
} from "@/modules/auth/auth.domain";
import type {
  CredentialEntry,
  LoginFinishInput,
  LoginFinishOutcome,
  RegisterFinishInput,
  RegisterStartInput,
  UpdateUserProfileInput,
  UserEntry,
} from "@/modules/auth/auth.types";
import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Auth service — Passkey (WebAuthn) ceremonies + stateless session cookies +
// user profile / credential management, orchestrated over `db`.
//
// Challenge store: single-process in-memory Map, 5-minute TTL, consumed once.
// Session cookie: HMAC-signed with SESSION_SECRET, payload carries userId.
// ---------------------------------------------------------------------------

type StoredChallenge =
  | {
      type: "register";
      challenge: string;
      // users 行由引导脚本创建（决策⑨），ceremony 只把凭证挂到现有单用户行。
      userId: string;
      // 门禁模式：引导期（首个凭证）还是登录态加设备（决定审计/响应文案）。
      mode: "first-time" | "authenticated";
      expiresAt: number;
    }
  | { type: "login"; challenge: string; expiresAt: number };

export const authService = {
  /** WebAuthn 未配置（dev）时认证整体跳过；两者齐备才算启用。 */
  isAuthEnabled(): boolean {
    return Boolean(env.WEBAUTHN_RP_ID && env.SESSION_SECRET);
  },

  sessionTtlSeconds(): number {
    return env.SESSION_TTL ?? DEFAULT_SESSION_TTL_SECONDS;
  },

  /**
   * 启动 fail-closed（决策⑨）：认证启用且 users 空表 → 抛错拒绝启动，
   * 提示先运行引导脚本创建首个用户。dev（认证未启用）直接跳过；
   * 只应在真实启动路径（index.ts）调用，不进 createApp（测试 app 不连 DB）。
   */
  async assertUsersSeeded(): Promise<void> {
    if (!this.isAuthEnabled()) return;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const decision = evaluateSeedGate(count);
    if (!decision.ok) {
      throw new AppError(ErrorCode.INTERNAL, decision.message, 500);
    }
  },

  // ---- Session cookie（载荷携带 userId）------------------------------------

  createSessionCookie(userId: string): string {
    const expires = Math.floor(Date.now() / 1000) + this.sessionTtlSeconds();
    return signSessionCookie(env.SESSION_SECRET!, expires, userId);
  },

  verifySessionCookie(value: string): SessionVerifyResult {
    if (!this.isAuthEnabled()) return { valid: true, userId: "" };
    return verifySessionCookie(
      env.SESSION_SECRET!,
      value,
      Math.floor(Date.now() / 1000),
    );
  },

  // ---- Challenge store（单进程内存，5 分钟，一次性）-------------------------

  _challenges: new Map<string, StoredChallenge>(),

  /** 清理已过期挑战，防止 Map 无限增长。 */
  _sweepChallenges(nowMs: number): void {
    for (const [id, rec] of this._challenges) {
      if (nowMs >= rec.expiresAt) this._challenges.delete(id);
    }
  },

  _storeChallenge(rec: StoredChallenge, nowMs = Date.now()): { challengeId: string; challenge: string } {
    this._sweepChallenges(nowMs);
    const challengeId = randomUUID();
    this._challenges.set(challengeId, { ...rec, expiresAt: nowMs + CHALLENGE_TTL_MS });
    return { challengeId, challenge: rec.challenge };
  },

  /** 一次性消费挑战：取走后即删除；缺失 / 类型不符 / 过期均抛 400。 */
  _consumeChallenge<T extends "register" | "login">(
    challengeId: string,
    type: T,
    nowMs = Date.now(),
  ): Extract<StoredChallenge, { type: T }> {
    const rec = this._challenges.get(challengeId);
    if (!rec || rec.type !== type) {
      throw new AppError(ErrorCode.VALIDATION, "挑战无效或已过期，请重新开始", 400);
    }
    this._challenges.delete(challengeId);
    if (nowMs >= rec.expiresAt) {
      throw new AppError(ErrorCode.VALIDATION, "挑战已过期，请重新开始", 400);
    }
    // 守卫已保证 rec.type === type；泛型 T 无法让 TS 自动收窄联合类型。
    return rec as Extract<StoredChallenge, { type: T }>;
  },

  // ---- 注册门禁 + 注册 ceremony -------------------------------------------

  /**
   * 注册门禁（需求 ⑦⑨）：passkey_credentials 计数为 0 → 校验 SETUP_TOKEN
   * （常量时间比对）；已有凭证 → 必须已登录（同一接口用于添加新设备凭证）。
   * 返回「引导期 / 已登录添加设备」两种模式。
   */
  async evaluateGate(input: {
    sessionUserId: string | null;
    providedSetupToken: string | undefined;
  }): Promise<{ mode: "first-time" } | { mode: "authenticated"; userId: string }> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(passkeyCredentials);
    const decision = evaluateRegisterGate({
      credentialCount: count,
      isAuthenticated: Boolean(input.sessionUserId),
      setupToken: env.SETUP_TOKEN,
      providedSetupToken: input.providedSetupToken,
    });
    if (decision.kind === "rejected") {
      throw new AppError(
        decision.code as ErrorCode,
        decision.message,
        decision.status,
      );
    }
    return decision.kind === "first-time"
      ? { mode: "first-time" }
      : { mode: "authenticated", userId: input.sessionUserId! };
  },

  async registerStart(
    input: RegisterStartInput & { sessionUserId: string | null },
  ): Promise<{ challengeId: string; options: Awaited<ReturnType<typeof generateRegistrationOptions>> }> {
    const gate = await this.evaluateGate({
      sessionUserId: input.sessionUserId,
      providedSetupToken: input.setupToken,
    });
    const isFirstTime = gate.mode === "first-time";

    // users 由引导脚本创建（决策⑨）：ceremony 的 user.name/displayName 取
    // 现有单用户行的 name，缺省回退 serenique-user / Serenique 用户。
    let userId: string;
    let name: string | null = null;
    let existing: CredentialEntry[] = [];
    if (isFirstTime) {
      const user = await this.getFirstUser();
      if (!user) {
        throw new AppError(
          ErrorCode.INTERNAL,
          "未找到用户，请先运行引导脚本创建用户：bun scripts/bootstrap-user.ts",
          500,
        );
      }
      userId = user.id;
      name = user.name;
    } else {
      userId = gate.userId;
      const user = await this.getProfile(userId);
      name = user.name;
      existing = await this.listCredentials(userId);
    }

    const challenge = randomBytes(32).toString("base64url");
    const { challengeId } = this._storeChallenge({
      type: "register",
      challenge,
      userId,
      mode: gate.mode,
      expiresAt: 0, // _storeChallenge 会按 nowMs 重新赋值
    });

    const options = await generateRegistrationOptions({
      rpName: env.WEBAUTHN_RP_NAME ?? "Serenique",
      rpID: env.WEBAUTHN_RP_ID!,
      userName: name ?? "serenique-user",
      userDisplayName: name ?? "Serenique 用户",
      userID: isoUint8Array.fromUTF8String(userId),
      challenge,
      attestationType: "none",
      excludeCredentials: existing.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports ?? undefined,
      })),
      authenticatorSelection: {
        // residentKey 要求 required：第三方提供方（微软 Authenticator、
        // 1Password 等）的 iOS 凭证提供扩展只在可发现凭证请求下才接管，
        // preferred 会被部分 App 拒绝（2026-08-09 实测 Authenticator 报不支持）。
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 60_000,
    });
    return { challengeId, options };
  },

  async registerFinish(
    input: RegisterFinishInput & { origin: string; ip: string },
  ): Promise<{ user: UserEntry; mode: "first-time" | "authenticated" }> {
    const record = this._consumeChallenge(input.challengeId, "register");

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: input.credential as unknown as Parameters<
          typeof verifyRegistrationResponse
        >[0]["response"],
        // 注意：库对 clientDataJSON.challenge（= base64url(服务端 challenge 字符串)）
        // 做字符串直比，expectedChallenge 必须传 base64url 编码后的值。
        expectedChallenge: isoBase64URL.fromUTF8String(record.challenge),
        expectedOrigin: input.origin,
        expectedRPID: env.WEBAUTHN_RP_ID!,
        requireUserVerification: true,
      });
    } catch (e) {
      fireAuditRecord({
        event: "auth.register",
        message: "注册验证失败",
        level: "warn",
        ip: input.ip,
        detail: { error: (e as Error).message },
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, "注册验证失败", 401);
    }
    if (!verification.verified) {
      fireAuditRecord({
        event: "auth.register",
        message: "注册验证失败",
        level: "warn",
        ip: input.ip,
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, "注册验证失败", 401);
    }

    const credInfo = verification.registrationInfo.credential;
    const credentialId = credInfo.id;
    const [dup] = await db
      .select({ id: passkeyCredentials.id })
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId));
    if (dup) throw new AppError(ErrorCode.CONFLICT, "该凭证已注册", 409);

    // users 行由引导脚本创建（决策⑨），register 只把凭证挂到现有单用户行；
    // 找不到用户（引导脚本未跑）→ 明确报错。
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.userId));
    if (!userRow) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        "未找到用户，请先运行引导脚本创建用户：bun scripts/bootstrap-user.ts",
        404,
      );
    }

    await db.insert(passkeyCredentials).values({
      userId: userRow.id,
      credentialId,
      publicKey: isoBase64URL.fromBuffer(credInfo.publicKey),
      transports: input.credential.transports ?? null,
      deviceLabel: input.deviceLabel ?? null,
      counter: credInfo.counter,
      lastUsedAt: new Date(),
    });

    fireAuditRecord({
      event: "auth.register",
      message: record.mode === "first-time" ? "注册成功" : "已添加新的登录凭证",
      level: "info",
      ip: input.ip,
      detail: { userId: userRow.id, credentialId },
    });
    return { user: toUserEntry(userRow), mode: record.mode };
  },

  // ---- 登录 ceremony -------------------------------------------------------

  async loginStart(): Promise<{ challengeId: string; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
    const creds = await db
      .select()
      .from(passkeyCredentials)
      .orderBy(asc(passkeyCredentials.createdAt));
    const challenge = randomBytes(32).toString("base64url");
    const { challengeId } = this._storeChallenge({
      type: "login",
      challenge,
      expiresAt: 0,
    });
    const options = await generateAuthenticationOptions({
      rpID: env.WEBAUTHN_RP_ID!,
      challenge,
      // 库中无凭证 → 空数组：客户端将展示「无可用通行密钥」。
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports ?? undefined,
      })),
      timeout: 60_000,
      userVerification: "preferred",
    });
    return { challengeId, options };
  },

  /**
   * 完成登录：校验断言签名 + counter（防克隆：仅回退拒绝，相等放行——Apple
   * 平台认证器不递增 signCount），成功后更新 counter 并返回用户。
   * 节流：失败（含无效挑战）记一次；窗口内 ≥5 次 → throttled。
   * delayMs / nowMs 可注入，单测无需真实等待。
   */
  async loginFinish(
    input: LoginFinishInput & { origin: string; ip: string },
    delayMs = 500,
    nowMs = Date.now(),
  ): Promise<LoginFinishOutcome> {
    this._sweep(nowMs);
    const state = this._throttle.get(input.ip);
    if (throttleShouldBlock(state, nowMs)) {
      fireAuditRecord({
        event: "auth.login_failed",
        message: "登录失败：尝试过于频繁，请稍后再试",
        level: "warn",
        ip: input.ip,
      });
      return { status: "throttled" };
    }

    const fail = async (reason: "invalid" | "counter") => {
      this._throttle.set(input.ip, throttleRecordFailure(state, nowMs));
      fireAuditRecord({
        event: "auth.login_failed",
        message:
          reason === "counter"
            ? "登录失败：凭证计数器回退，可能存在克隆风险"
            : "登录失败：登录验证未通过",
        level: "warn",
        ip: input.ip,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { status: "rejected", reason } as const;
    };

    // 挑战一次性消费；无效/过期挑战同样计入节流失败。
    let record: StoredChallenge;
    try {
      record = this._consumeChallenge(input.challengeId, "login", nowMs);
    } catch (e) {
      this._throttle.set(input.ip, throttleRecordFailure(state, nowMs));
      fireAuditRecord({
        event: "auth.login_failed",
        message: "登录失败：挑战无效或已过期",
        level: "warn",
        ip: input.ip,
      });
      throw e;
    }

    const [credRow] = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, input.credential.id));
    if (!credRow) return fail("invalid");

    // counter 防克隆预检：先于签名校验解析 authenticatorData 的 signCount，
    // 仅「新值 < 旧值」（回退）判失败——相等是合法（Apple 平台认证器不递增）。
    try {
      const parsed = parseAuthenticatorData(
        isoBase64URL.toBuffer(input.credential.response.authenticatorData),
      );
      if (parsed.counter < credRow.counter) {
        return fail("counter");
      }
    } catch {
      return fail("invalid");
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.credential as unknown as Parameters<
          typeof verifyAuthenticationResponse
        >[0]["response"],
        // 同 register：expectedChallenge 需要 base64url 编码后的挑战值。
        expectedChallenge: isoBase64URL.fromUTF8String(record.challenge),
        expectedOrigin: input.origin,
        expectedRPID: env.WEBAUTHN_RP_ID!,
        credential: {
          id: credRow.credentialId,
          publicKey: isoBase64URL.toBuffer(credRow.publicKey),
          // counter 恒传 0 以禁用库内严格检查（v13.3.2 内部 `counter <= stored`
          // 会拒绝相等——Apple 平台认证器不递增 signCount，导致合法登录被拒）。
          // 防克隆 counter 语义由上方预检 + 下方终检把关（仅回退拒绝）。
          counter: 0,
          transports: credRow.transports ?? undefined,
        },
        requireUserVerification: true,
      });
    } catch {
      return fail("invalid");
    }
    if (!verification.verified) return fail("invalid");

    // counter 防克隆：仅回退（新 < 旧）拒绝；相等放行（Apple 等不递增计数）。
    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter < credRow.counter) return fail("counter");

    await db
      .update(passkeyCredentials)
      .set({ counter: newCounter, lastUsedAt: new Date() })
      .where(eq(passkeyCredentials.id, credRow.id));
    this._throttle.delete(input.ip);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, credRow.userId));
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, "用户不存在", 404);

    fireAuditRecord({
      event: "auth.login",
      message: "登录成功",
      level: "info",
      ip: input.ip,
    });
    return { status: "ok", user: toUserEntry(user) };
  },

  // ---- 用户资料 ------------------------------------------------------------

  async getProfile(userId: string): Promise<UserEntry> {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "用户不存在", 404);
    return toUserEntry(row);
  },

  /** 取唯一用户（单用户系统）；尚未注册时返回 null。令牌身份的 me 用。 */
  async getFirstUser(): Promise<UserEntry | null> {
    const [row] = await db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);
    return row ? toUserEntry(row) : null;
  },

  async updateProfile(
    userId: string,
    patch: UpdateUserProfileInput,
  ): Promise<UserEntry> {
    const [row] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "用户不存在", 404);
    return toUserEntry(row);
  },

  // ---- 凭证管理 ------------------------------------------------------------

  async listCredentials(userId: string): Promise<CredentialEntry[]> {
    const rows = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, userId))
      .orderBy(desc(passkeyCredentials.createdAt));
    return rows.map(toCredentialEntry);
  },

  /** 删除凭证；删最后一把前拒绝（防止把唯一入口锁死）。 */
  async deleteCredential(input: {
    userId: string;
    credentialId: string;
  }): Promise<void> {    const [row] = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.id, input.credentialId));
    if (!row || row.userId !== input.userId) {
      throw new AppError(ErrorCode.NOT_FOUND, "凭证不存在", 404);
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, input.userId));
    if (count <= 1) {
      throw new AppError(ErrorCode.CONFLICT, "至少需要保留一把登录凭证", 409);
    }
    await db
      .delete(passkeyCredentials)
      .where(eq(passkeyCredentials.id, row.id));
    fireAuditRecord({
      event: "auth.credential_delete",
      message: "已删除登录凭证",
      level: "warn",
      detail: { id: row.id, credentialId: row.credentialId },
    });
  },

  /** 重命名设备标签（清空 → null = 未命名）。 */
  async updateCredentialLabel(input: {
    userId: string;
    credentialId: string;
    deviceLabel: string | null;
  }): Promise<CredentialEntry> {
    const [row] = await db
      .update(passkeyCredentials)
      .set({ deviceLabel: input.deviceLabel })
      .where(
        and(
          eq(passkeyCredentials.id, input.credentialId),
          eq(passkeyCredentials.userId, input.userId),
        ),
      )
      .returning();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "凭证不存在", 404);
    fireAuditRecord({
      event: "auth.credential_rename",
      message: "已重命名登录凭证",
      level: "info",
      detail: { id: row.id, deviceLabel: row.deviceLabel },
    });
    return toCredentialEntry(row);
  },

  // ---- Login throttle（内存，单进程；key = IP）------------------------------

  _throttle: new Map<string, ThrottleState>(),

  /** 清理已过窗口的节流记录，防止 Map 无限增长。 */
  _sweep(nowMs: number): void {
    for (const [key, state] of this._throttle) {
      if (nowMs >= state.resetAtMs) this._throttle.delete(key);
    }
  },
};
