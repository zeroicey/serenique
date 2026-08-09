import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createBunWebSocket } from "hono/bun";
import { createTestAuthenticator, simulateAuthentication, simulateRegistration, type TestAuthenticator } from "@/test/webauthn";
import { RUN_DB_TESTS, RUN_TOKEN, setTestEnv, TEST_SETUP_TOKEN } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Auth + tokens integration — real PostgreSQL (RUN_DB_TESTS=1).
//
// 完整 WebAuthn ceremony 通过 HTTP 跑：引导期注册（SETUP_TOKEN 门禁，users
// 行由 beforeAll 预置——模拟引导脚本产物，决策⑨ 后 register 不再建用户）→
// 自动登录 cookie → users/me → 登录态添加第二把凭证 → login/start+finish
// （含 counter 严格校验）→ API token 创建/Bearer 访问/撤销 → 签名 blob 链接
// 仍公开 → logout。
//
// 门禁按「凭证计数」判定（需求 ⑦⑨）：credentials 空 → 引导期（SETUP_TOKEN）；
// ≥1 → 需已登录会话。users 表是单行语义：beforeAll 清空全表后预置 marker
// 用户行，本仓库其他集成测试不创建用户行，无并行竞态。审计行断言用带
// RUN_TOKEN 的 marker IP，崩溃残留的旧行不会污染计数。
// ---------------------------------------------------------------------------

setTestEnv({ WEBAUTHN_RP_ID: "localhost", WEBAUTHN_ORIGINS: "http://localhost:5173,http://localhost:3000" });

const RP_ID = "localhost";
const ORIGIN = "http://localhost:5173";
const USER_MARKER = "it-auth-e2e";
const TOKEN_MARKER = "it-auth-token";

describe.skipIf(!RUN_DB_TESTS)("auth + tokens integration", () => {
  let createApp: typeof import("@/app").createApp;
  let db: typeof import("@/db/connection").db;
  let users: typeof import("@/modules/auth/auth.schema").users;
  let passkeyCredentials: typeof import("@/modules/auth/auth.schema").passkeyCredentials;
  let apiTokens: typeof import("@/modules/tokens/token.schema").apiTokens;
  let auditLogs: typeof import("@/modules/audit/audit.schema").auditLogs;
  let app: ReturnType<typeof import("@/app").createApp>;

  const createdAuditIds: string[] = [];
  const createdTokenIds: string[] = [];
  // 每个运行唯一：崩溃残留的旧审计行不会污染本轮的 count 断言
  const IP_LOGIN = `it-auth-e2e-${RUN_TOKEN}-login`;
  const IP_COUNTER = `it-auth-e2e-${RUN_TOKEN}-counter`;
  const IP_COUNTER_EQUAL = `it-auth-e2e-${RUN_TOKEN}-counter-equal`;
  const IP_UNKNOWN = `it-auth-e2e-${RUN_TOKEN}-unknown`;
  const IP_FORGED = `it-auth-e2e-${RUN_TOKEN}-forged`;
  let device1: TestAuthenticator;
  let device2: TestAuthenticator;
  let cookie1 = ""; // 首次注册自动登录的会话 cookie
  let userId = "";
  let credentialId1 = "";

  function trackAudit(row: { id: string } | undefined): void {
    if (row) createdAuditIds.push(row.id);
  }

  /** Poll the DB until rows matching `where` appear (fire-and-forget writes). */
  async function waitForAuditRows(
    where: SQL | undefined,
    timeoutMs = 3000,
  ): Promise<typeof auditLogs.$inferSelect[]> {
    const deadline = Date.now() + timeoutMs;
    let rows: typeof auditLogs.$inferSelect[] = [];
    do {
      rows = where
        ? await db.select().from(auditLogs).where(where).limit(20)
        : await db.select().from(auditLogs).limit(20);
      if (rows.length > 0) return rows;
      await Bun.sleep(40);
    } while (Date.now() < deadline);
    return rows;
  }

  function makeApp() {
    return createApp(
      {
        DATABASE_URL: process.env.DATABASE_URL!,
        BLOB_ROOT: process.env.BLOB_ROOT!,
        BLOB_MAX_SIZE: 104857600,
        BLOB_SIGNING_SECRET: process.env.BLOB_SIGNING_SECRET!,
        SESSION_SECRET: process.env.SESSION_SECRET!,
        SETUP_TOKEN: process.env.SETUP_TOKEN!,
        WEBAUTHN_RP_ID: RP_ID,
        WEBAUTHN_RP_NAME: "Serenique",
        WEBAUTHN_ORIGINS: [ORIGIN, "http://localhost:3000"],
        PORT: 3000,
        NODE_ENV: "test",
      },
      { upgradeWebSocket: createBunWebSocket().upgradeWebSocket },
    );
  }

  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    createApp = (await import("@/app")).createApp;
    db = (await import("@/db/connection")).db;
    users = (await import("@/modules/auth/auth.schema")).users;
    passkeyCredentials = (await import("@/modules/auth/auth.schema")).passkeyCredentials;
    apiTokens = (await import("@/modules/tokens/token.schema")).apiTokens;
    auditLogs = (await import("@/modules/audit/audit.schema")).auditLogs;
    // users 表单行语义：清空全表（credentials 级联）后预置 marker 用户行，
    // 模拟引导脚本的产物——决策⑨ 后 register/start|finish 不再创建用户。
    await db.delete(users);
    const [seeded] = await db
      .insert(users)
      .values({ name: USER_MARKER, email: "e2e@example.com" })
      .returning();
    userId = seeded.id;
    await db.delete(apiTokens).where(sql`${apiTokens.name} LIKE ${TOKEN_MARKER + "-%"}`);
    app = makeApp();
    device1 = await createTestAuthenticator();
    device2 = await createTestAuthenticator();
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS) return;
    await db.delete(users).where(eq(users.name, USER_MARKER)); // 级联删除凭证
    if (createdTokenIds.length > 0) {
      await db.delete(apiTokens).where(inArray(apiTokens.id, createdTokenIds));
    }
    if (createdAuditIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.id, createdAuditIds));
    }
  });

  test("引导期（凭证 0）：错误 SETUP_TOKEN → 403；正确 → 注册成功 + 自动登录", async () => {
    // 启动 fail-closed 检查（决策⑨）：users 已有行 → 放行
    const { authService } = await import("@/modules/auth/auth.service");
    await expect(authService.assertUsersSeeded()).resolves.toBeUndefined();

    // 凭证计数为 0 时，错误令牌必须被拒（门禁）
    const bad = await app.request("/api/auth/register/start", json({ setupToken: "wrong-token-0123456789abcdef" }));
    expect(bad.status).toBe(403);

    // 引导期注册：带 setupToken、不带 userInfo（决策⑨：users 由引导脚本创建）
    const start = await app.request(
      "/api/auth/register/start",
      json({ setupToken: TEST_SETUP_TOKEN }),
    );
    expect(start.status).toBe(200);
    const startBody = await start.json();
    expect(startBody.data.challengeId).toBeTruthy();
    expect(startBody.data.options.rp.id).toBe(RP_ID);
    // options 的 user 实体取现有单用户行（name/displayName 来自 users.name）
    expect(startBody.data.options.user.id).toBe(isoBase64URL.fromUTF8String(userId));
    expect(startBody.data.options.user.name).toBe(USER_MARKER);
    const challenge: string = startBody.data.options.challenge;

    const credential = await simulateRegistration({
      rpID: RP_ID,
      origin: ORIGIN,
      challenge,
      authenticator: device1,
    });
    const finish = await app.request(
      "/api/auth/register/finish",
      json({ challengeId: startBody.data.challengeId, credential, deviceLabel: "测试设备-1" }),
    );
    expect(finish.status).toBe(200);
    const finishBody = await finish.json();
    expect(finishBody.data.authenticated).toBe(true);
    // 用户行是预置的：返回的 user 就是 seeded 行（不新建）
    expect(finishBody.data.user.id).toBe(userId);
    expect(finishBody.data.user.name).toBe(USER_MARKER);
    credentialId1 = device1.credentialId;
    cookie1 = (finish.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie1).toContain("serenique_session=");

    // DB：users 1 行（预置行不变）+ credentials 1 行
    const [userRow] = await db.select().from(users).where(eq(users.id, userId));
    expect(userRow).toBeDefined();
    const credRows = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, userRow!.id));
    expect(credRows.length).toBe(1);
    expect(credRows[0].credentialId).toBe(credentialId1);

    // 审计：auth.register
    const rows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.register"), sql`${auditLogs.detail}->>'userId' = ${userRow!.id}`),
    );
    expect(rows.length).toBe(1);
    trackAudit(rows[0]);
  });

  test("cookie 访问 /auth/me 与 /auth/credentials", async () => {
    const me = await app.request("/api/auth/me", { headers: { cookie: cookie1 } });
    expect(me.status).toBe(200);
    const meBody = await me.json();
    expect(meBody.data.authenticated).toBe(true);
    expect(meBody.data.user.id).toBe(userId);

    const creds = await app.request("/api/auth/credentials", { headers: { cookie: cookie1 } });
    expect(creds.status).toBe(200);
    expect((await creds.json()).data.items.length).toBe(1);
  });

  test("users/me：部分更新 + 清空 + 非法日期拒绝", async () => {
    const put = await app.request("/api/users/me", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie1 },
      body: JSON.stringify({ email: "new@example.com", birthday: "1990-01-01" }),
    });
    expect(put.status).toBe(200);
    const got = await app.request("/api/users/me", { headers: { cookie: cookie1 } });
    const body = await got.json();
    expect(body.data.email).toBe("new@example.com");
    expect(body.data.birthday).toBe("1990-01-01");

    // "" → 清空为 null
    await app.request("/api/users/me", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie1 },
      body: JSON.stringify({ email: "" }),
    });
    const after = await app.request("/api/users/me", { headers: { cookie: cookie1 } });
    expect((await after.json()).data.email).toBeNull();

    // 非法日期 / 空 body → 400
    const badDate = await app.request("/api/users/me", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie1 },
      body: JSON.stringify({ birthday: "1990-13-01" }),
    });
    expect(badDate.status).toBe(400);
    const empty = await app.request("/api/users/me", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie1 },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  test("已有凭证后：无会话注册 → 401（即使带 SETUP_TOKEN）；带会话添加第二把凭证 → 成功", async () => {
    // 门禁：凭证 ≥1 + 未登录 → 401（决策⑦⑨：加设备必须已登录）
    const unauth = await app.request(
      "/api/auth/register/start",
      json({ setupToken: TEST_SETUP_TOKEN }),
    );
    expect(unauth.status).toBe(401);

    // 登录态：同一接口添加新设备
    const start = await app.request("/api/auth/register/start", json({}, { cookie: cookie1 }));
    expect(start.status).toBe(200);
    const startBody = await start.json();
    expect(startBody.data.options.excludeCredentials.some((c: { id: string }) => c.id === credentialId1)).toBe(true);

    const credential = await simulateRegistration({
      rpID: RP_ID,
      origin: ORIGIN,
      challenge: startBody.data.options.challenge,
      authenticator: device2,
    });
    const finish = await app.request(
      "/api/auth/register/finish",
      json({ challengeId: startBody.data.challengeId, credential }),
    );
    expect(finish.status).toBe(200);
    expect((await finish.json()).data.user.id).toBe(userId);

    const credRows = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, userId));
    expect(credRows.length).toBe(2);
  });

  test("凭证管理：重命名设备标签（PATCH）；空串清空；不存在 → 404", async () => {
    const creds = await app.request("/api/auth/credentials", { headers: { cookie: cookie1 } });
    const items = (await creds.json()).data.items as Array<{ id: string; deviceLabel: string | null }>;
    expect(items.length).toBe(2);
    const target = items.find((i) => i.deviceLabel == null)!;
    expect(target).toBeDefined();

    // 重命名
    const patch = await app.request(`/api/auth/credentials/${target.id}`, {
      method: "PATCH",
      headers: { cookie: cookie1, "content-type": "application/json" },
      body: JSON.stringify({ deviceLabel: "iPhone · Apple" }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()).data.deviceLabel).toBe("iPhone · Apple");

    // 列表同步
    const after = await app.request("/api/auth/credentials", { headers: { cookie: cookie1 } });
    const renamed = ((await after.json()).data.items as Array<{ id: string; deviceLabel: string | null }>)
      .find((i) => i.id === target.id)!;
    expect(renamed.deviceLabel).toBe("iPhone · Apple");

    // 审计
    const rows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.credential_rename"), sql`${auditLogs.detail}->>'id' = ${target.id}`),
    );
    expect(rows.length).toBe(1);
    trackAudit(rows[0]);

    // 空字符串 → 清空（null）
    const clear = await app.request(`/api/auth/credentials/${target.id}`, {
      method: "PATCH",
      headers: { cookie: cookie1, "content-type": "application/json" },
      body: JSON.stringify({ deviceLabel: "  " }),
    });
    expect(clear.status).toBe(200);
    expect((await clear.json()).data.deviceLabel).toBeNull();

    // 不存在 / 越权 → 404
    const missing = await app.request("/api/auth/credentials/00000000-0000-4000-8000-000000000000", {
      method: "PATCH",
      headers: { cookie: cookie1, "content-type": "application/json" },
      body: JSON.stringify({ deviceLabel: "x" }),
    });
    expect(missing.status).toBe(404);
  });

  test("凭证管理：删除一把成功；删除最后一把 → 409", async () => {
    const creds = await app.request("/api/auth/credentials", { headers: { cookie: cookie1 } });
    const items = (await creds.json()).data.items as Array<{ id: string; credentialId: string }>;
    expect(items.length).toBe(2);
    const second = items.find((i) => i.credentialId !== credentialId1)!;
    expect(second).toBeDefined();

    const del = await app.request(`/api/auth/credentials/${second.id}`, {
      method: "DELETE",
      headers: { cookie: cookie1 },
    });
    expect(del.status).toBe(204);

    const after = await app.request("/api/auth/credentials", { headers: { cookie: cookie1 } });
    expect((await after.json()).data.items.length).toBe(1);

    // 只剩 device1 → 再删必须 409（防锁死）
    const delLast = await app.request(`/api/auth/credentials/${items.find((i) => i.credentialId === credentialId1)!.id}`, {
      method: "DELETE",
      headers: { cookie: cookie1 },
    });
    expect(delLast.status).toBe(409);
    expect((await delLast.json()).success).toBe(false);

    // 审计：auth.credential_delete
    const rows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.credential_delete"), sql`${auditLogs.detail}->>'id' = ${second.id}`),
    );
    expect(rows.length).toBe(1);
    trackAudit(rows[0]);
  });

  test("登录 ceremony：login/start → finish（counter 严格校验）→ 新会话可用", async () => {
    const start = await app.request("/api/auth/login/start", { method: "POST" });
    expect(start.status).toBe(200);
    const startBody = await start.json();
    expect(startBody.data.challengeId).toBeTruthy();
    // allowCredentials 只剩 device1
    expect(startBody.data.options.allowCredentials.length).toBe(1);
    expect(startBody.data.options.allowCredentials[0].id).toBe(credentialId1);

    // counter=1 > 存储的 0 → 成功
    const credential = await simulateAuthentication({
      rpID: RP_ID,
      origin: ORIGIN,
      challenge: startBody.data.options.challenge,
      authenticator: device1,
      counter: 1,
    });
    const finish = await app.request(
      "/api/auth/login/finish",
      json({ challengeId: startBody.data.challengeId, credential }, { "cf-connecting-ip": IP_LOGIN }),
    );
    expect(finish.status).toBe(200);
    const finishBody = await finish.json();
    expect(finishBody.data.authenticated).toBe(true);
    expect(finishBody.data.user.id).toBe(userId);
    const loginCookie = (finish.headers.get("set-cookie") ?? "").split(";")[0];

    const me = await app.request("/api/auth/me", { headers: { cookie: loginCookie } });
    expect(me.status).toBe(200);
    expect((await me.json()).data.user.id).toBe(userId);

    // counter 已更新为 1
    const [credRow] = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId1));
    expect(credRow!.counter).toBe(1);

    // 审计：auth.login（marker IP，每个运行唯一）
    const rows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.login"), eq(auditLogs.ip, IP_LOGIN)),
    );
    expect(rows.length).toBe(1);
    trackAudit(rows[0]);
  });

  test("登录失败：counter 回退（克隆信号）→ 401 + 审计", async () => {
    const start = await app.request("/api/auth/login/start", { method: "POST" });
    const startBody = await start.json();
    // counter=0 ≤ 已存 1 → 严格校验拒绝
    const credential = await simulateAuthentication({
      rpID: RP_ID,
      origin: ORIGIN,
      challenge: startBody.data.options.challenge,
      authenticator: device1,
      counter: 0,
    });
    const finish = await app.request(
      "/api/auth/login/finish",
      json({ challengeId: startBody.data.challengeId, credential }, { "cf-connecting-ip": IP_COUNTER }),
    );
    expect(finish.status).toBe(401);

    const rows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.login_failed"), eq(auditLogs.ip, IP_COUNTER)),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].message).toContain("计数器");
    trackAudit(rows[0]);
  });

  test("登录成功：counter 相等（Apple 平台认证器不递增计数）→ 放行", async () => {
    // 已存 counter=1（上个用例）；Apple 平台 passkey 每次断言 signCount 不变。
    // 相等必须放行（仅回退才算克隆信号），且存储值不倒退。
    const start = await app.request("/api/auth/login/start", { method: "POST" });
    const startBody = await start.json();
    const credential = await simulateAuthentication({
      rpID: RP_ID,
      origin: ORIGIN,
      challenge: startBody.data.options.challenge,
      authenticator: device1,
      counter: 1, // == 已存 1
    });
    const finish = await app.request(
      "/api/auth/login/finish",
      json(
        { challengeId: startBody.data.challengeId, credential },
        { "cf-connecting-ip": IP_COUNTER_EQUAL },
      ),
    );
    expect(finish.status).toBe(200);
    const finishBody = await finish.json();
    expect(finishBody.data.authenticated).toBe(true);

    // counter 未回退（仍为 1）
    const [credRow] = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId1));
    expect(credRow!.counter).toBe(1);
  });

  test("登录失败：伪造签名 / 未知凭证 → 401 + 审计", async () => {
    // 未知凭证 id（库中不存在）→ rejected（不触发 WebAuthn 库校验）
    const start = await app.request("/api/auth/login/start", { method: "POST" });
    const startBody = await start.json();
    const unknown = await app.request(
      "/api/auth/login/finish",
      json(
        {
          challengeId: startBody.data.challengeId,
          credential: {
            id: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            rawId: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            type: "public-key",
            response: { clientDataJSON: "e30=", authenticatorData: "e30=", signature: "e30=" },
            clientExtensionResults: {},
          },
        },
        { "cf-connecting-ip": IP_UNKNOWN },
      ),
    );
    expect(unknown.status).toBe(401);

    // 真实凭证 + 错误 challenge（用伪造的 challenge 签名）→ 校验失败
    const start2 = await app.request("/api/auth/login/start", { method: "POST" });
    const start2Body = await start2.json();
    const forged = await simulateAuthentication({
      rpID: RP_ID,
      origin: ORIGIN,
      challenge: "not-the-issued-challenge",
      authenticator: device1,
      counter: 2,
    });
    const forgedRes = await app.request(
      "/api/auth/login/finish",
      json({ challengeId: start2Body.data.challengeId, credential: forged }, { "cf-connecting-ip": IP_FORGED }),
    );
    expect(forgedRes.status).toBe(401);

    const rows = await waitForAuditRows(
      and(
        eq(auditLogs.event, "auth.login_failed"),
        sql`${auditLogs.ip} IN (${IP_UNKNOWN}, ${IP_FORGED})`,
      ),
    );
    expect(rows.length).toBe(2);
    for (const r of rows) trackAudit(r);
  });

  test("token 流程：创建（明文一次）→ Bearer 访问 → 撤销后 401", async () => {
    const created = await app.request(
      "/api/tokens",
      json({ name: `${TOKEN_MARKER}-mac` }, { cookie: cookie1 }),
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const plaintext = createdBody.data.plaintext as string;
    expect(plaintext.startsWith("serenique_")).toBe(true);
    expect(createdBody.data.item.prefix).toBeTruthy();
    expect(createdBody.data.item.plaintext).toBeUndefined();
    const tokenId = createdBody.data.item.id as string;
    createdTokenIds.push(tokenId);

    // Bearer 访问（token 身份）——/api/tokens 与业务接口都通
    const bearer = { authorization: `Bearer ${plaintext}` };
    const listByBearer = await app.request("/api/tokens", { headers: bearer });
    expect(listByBearer.status).toBe(200);
    const moments = await app.request("/api/moments", { headers: bearer });
    expect(moments.status).toBe(200);

    // 令牌身份 /auth/me → 200 + authenticated:true（携带单用户资料）
    const meByBearer = await app.request("/api/auth/me", { headers: bearer });
    expect(meByBearer.status).toBe(200);
    const meBody = await meByBearer.json();
    expect(meBody.data.authenticated).toBe(true);
    expect(meBody.data.user?.id).toBeTruthy();

    // 列表无明文字段
    const listBody = await listByBearer.json();
    expect(listBody.data.items.some((i: { id: string }) => i.id === tokenId)).toBe(true);
    expect(listBody.data.items[0].plaintext).toBeUndefined();

    // 审计 token.create
    const rows = await waitForAuditRows(
      and(eq(auditLogs.event, "token.create"), sql`${auditLogs.detail}->>'id' = ${tokenId}`),
    );
    expect(rows.length).toBe(1);
    trackAudit(rows[0]);

    // 撤销 → 该 Bearer 立即失效
    const revoke = await app.request(`/api/tokens/${tokenId}`, {
      method: "DELETE",
      headers: { cookie: cookie1 },
    });
    expect(revoke.status).toBe(204);
    expect((await app.request("/api/moments", { headers: bearer })).status).toBe(401);
    expect((await app.request("/api/tokens", { headers: bearer })).status).toBe(401);

    const revokeRows = await waitForAuditRows(
      and(eq(auditLogs.event, "token.revoke"), sql`${auditLogs.detail}->>'id' = ${tokenId}`),
    );
    expect(revokeRows.length).toBe(1);
    trackAudit(revokeRows[0]);
  });

  test("签名 blob 链接仍公开；无签名/无凭证 → 401", async () => {
    expect(
      (await app.request("/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/file")).status,
    ).toBe(401);
    const signed = await app.request(
      "/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/file?expires=9999999999&signature=bad",
    );
    expect(signed.status).not.toBe(401); // 放行到 handler（blob 不存在 → 404）
  });

  test("logout 下发清 cookie 头（无状态会话：旧 cookie 服务端仍有效，属已知权衡）", async () => {
    const out = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie: cookie1 },
    });
    expect(out.status).toBe(200);
    expect((await out.json()).data.authenticated).toBe(false);
    const setCookie = out.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("serenique_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  test("未认证 /auth/me → 401（中间件拦截）", async () => {
    expect((await app.request("/api/auth/me")).status).toBe(401);
  });

  test("启动 fail-closed（决策⑨）：users 空表 → assertUsersSeeded 抛错", async () => {
    // 本用例必须是最后一个：删掉预置用户行后，整个测试文件的其余流程已跑完。
    const { authService } = await import("@/modules/auth/auth.service");
    await db.delete(users).where(eq(users.id, userId)); // 级联删除凭证

    let error: unknown;
    try {
      await authService.assertUsersSeeded();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    const err = error as { status?: number; message?: string };
    expect(err.status).toBe(500);
    expect(err.message).toContain("bun scripts/bootstrap-user.ts");
  });
});
