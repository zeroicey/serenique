import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Auth domain — pure rules: session cookie signing/verification (payload now
// carries the userId), constant-time compare, login-throttle state transitions,
// and the registration gate decision. No DB / IO imports.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "serenique_session";
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 3600; // 30 天
export const CHALLENGE_TTL_MS = 5 * 60_000; // WebAuthn challenge 有效期 5 分钟
export const LOGIN_THROTTLE_WINDOW_MS = 10 * 60_000; // 10 分钟
export const LOGIN_THROTTLE_MAX_ATTEMPTS = 5;

const SESSION_PREFIX = "serenique-session.";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Constant-time string compare (mirrors blob.domain signaturesEqual). */
export function secretsEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sign a session cookie carrying the user identity:
 * "<exp>.<userId>.<base64url(HMAC-SHA256(secret, prefix+exp.userId))>".
 * The userId is part of the signed payload, so swapping it in a cookie
 * invalidates the signature.
 */
export function signSessionCookie(
  secret: string,
  expires: number,
  userId: string,
): string {
  const sig = createHmac("sha256", secret)
    .update(`${SESSION_PREFIX}${expires}.${userId}`)
    .digest("base64url");
  return `${expires}.${userId}.${sig}`;
}

export type SessionVerifyResult =
  | { valid: true; userId: string }
  | { valid: false; reason: "malformed" | "tampered" | "expired" };

/** Verify a session cookie value at a given unix-second clock. */
export function verifySessionCookie(
  secret: string,
  value: string,
  nowSec: number,
): SessionVerifyResult {
  const parts = value.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [expStr, userId, signature] = parts;
  const expires = Number(expStr);
  if (!Number.isInteger(expires) || expires <= 0 || !UUID_RE.test(userId)) {
    return { valid: false, reason: "malformed" };
  }
  const expected = signSessionCookie(secret, expires, userId);
  const expectedSignature = expected.split(".")[2];
  if (!secretsEqual(signature, expectedSignature)) {
    return { valid: false, reason: "tampered" };
  }
  if (expires < nowSec) return { valid: false, reason: "expired" };
  return { valid: true, userId };
}

/**
 * Build a Set-Cookie header. crossSite=true 用于生产（serenique.0icey.icu →
 * api.hcyj.xyz）：SameSite=None + Secure 之外再加 **Partitioned**（CHIPS）——
 * 移动端 Safari/Chrome 默认拦截跨站第三方 cookie，Partitioned 让 cookie 按
 * 顶层站点（serenique.0icey.icu）分区存储，仅同顶层站点的请求携带，安全语义
 * 恰好符合单用户私有部署。dev 走 Vite 代理（同源）用 SameSite=Lax。
 * secure=false 用于 dev（http），生产必须 true（https）。
 */
export function buildSessionCookie(
  value: string,
  maxAgeSeconds: number,
  crossSite: boolean,
  secure: boolean,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    crossSite ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  if (crossSite) parts.push("Partitioned");
  return parts.join("; ");
}

export function clearSessionCookie(crossSite: boolean, secure: boolean): string {
  return buildSessionCookie("", 0, crossSite, secure);
}

// ---- Registration gate -----------------------------------------------------
// 注册门禁（需求 2026-08-09-passkey-auth.md ⑦⑨）：按「凭证计数」判定，
// 不再看 users 行数（users 由引导脚本创建，register 不再建用户）：
//   passkey_credentials 计数为 0 → 引导期：必须携带与 SETUP_TOKEN 常量时间
//   比对通过的引导令牌 → 首次凭证 ceremony；
//   计数 ≥ 1 → 必须已登录会话 → 「添加新设备凭证」ceremony（同一接口）。

export type RegisterGateDecision =
  | { kind: "first-time" }
  | { kind: "authenticated" }
  | { kind: "rejected"; code: string; message: string; status: number };

export function evaluateRegisterGate(opts: {
  credentialCount: number;
  isAuthenticated: boolean;
  setupToken: string | undefined;
  providedSetupToken: string | undefined;
}): RegisterGateDecision {
  if (opts.credentialCount === 0) {
    if (!opts.setupToken) {
      return {
        kind: "rejected",
        code: "INTERNAL",
        status: 500,
        message: "服务端未配置引导注册令牌（SETUP_TOKEN），无法注册",
      };
    }
    if (
      !opts.providedSetupToken ||
      !secretsEqual(opts.providedSetupToken, opts.setupToken)
    ) {
      return {
        kind: "rejected",
        code: "FORBIDDEN",
        status: 403,
        message: "引导注册令牌不正确",
      };
    }
    return { kind: "first-time" };
  }
  if (!opts.isAuthenticated) {
    return {
      kind: "rejected",
      code: "UNAUTHORIZED",
      status: 401,
      message: "请先登录后再添加新的登录凭证",
    };
  }
  return { kind: "authenticated" };
}

// ---- Startup seed gate（决策⑨）--------------------------------------------
// 认证启用时启动 fail-closed：users 空表（尚未运行引导脚本）→ 拒绝启动。

export type SeedGateDecision = { ok: true } | { ok: false; message: string };

export function evaluateSeedGate(userCount: number): SeedGateDecision {
  if (userCount === 0) {
    return {
      ok: false,
      message:
        "请先运行引导脚本创建首个用户：bun scripts/bootstrap-user.ts" +
        "（或 docker compose run --rm api bun scripts/bootstrap-user.ts）",
    };
  }
  return { ok: true };
}

// ---- Login throttle (pure state transitions; state held in-memory at service) ----

export type ThrottleState = { count: number; resetAtMs: number };

export function throttleIsBlocked(
  state: ThrottleState | undefined,
  nowMs: number,
): boolean {
  if (!state) return false;
  return nowMs < state.resetAtMs;
}

/** Record one failed attempt; returns the new state (window restarts on expiry). */
export function throttleRecordFailure(
  state: ThrottleState | undefined,
  nowMs: number,
  windowMs = LOGIN_THROTTLE_WINDOW_MS,
): ThrottleState {
  if (!state || nowMs >= state.resetAtMs) {
    return { count: 1, resetAtMs: nowMs + windowMs };
  }
  return { count: state.count + 1, resetAtMs: state.resetAtMs };
}

/** True when the attempt counter has hit the cap within the window. */
export function throttleShouldBlock(
  state: ThrottleState | undefined,
  nowMs: number,
  max = LOGIN_THROTTLE_MAX_ATTEMPTS,
): boolean {
  return throttleIsBlocked(state, nowMs) && (state?.count ?? 0) >= max;
}
