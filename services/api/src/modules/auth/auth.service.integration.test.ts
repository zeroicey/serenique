import { describe, expect, test } from "bun:test";
import { setTestEnv, TEST_AUTH_TOKEN, RUN_DB_TESTS } from "@/test/helpers";

setTestEnv();

// 认证中间件集成测试：真实 HTTP 走 createApp（DB 门控，登录成功后的写路径用真库）。
describe.skipIf(!RUN_DB_TESTS)("auth middleware integration", () => {
  async function makeAuthedApp() {
    const { createApp } = await import("@/app");
    return createApp({
      DATABASE_URL: process.env.DATABASE_URL!,
      BLOB_ROOT: process.env.BLOB_ROOT!,
      BLOB_MAX_SIZE: 104857600,
      BLOB_SIGNING_SECRET: process.env.BLOB_SIGNING_SECRET!,
      AUTH_TOKEN: TEST_AUTH_TOKEN,
      PORT: 3000,
      NODE_ENV: "test",
    });
  }

  test("rejects no-credential and wrong-token requests with 401", async () => {
    const app = await makeAuthedApp();
    expect((await app.request("/api/diaries")).status).toBe(401);
    expect(
      (
        await app.request("/api/diaries", {
          headers: { authorization: "Bearer wrong-token" },
        })
      ).status,
    ).toBe(401);
  });

  test("login → cookie → authed read/write round-trip", async () => {
    const app = await makeAuthedApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TEST_AUTH_TOKEN }),
    });
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];

    // 带 Cookie 建日记
    const created = await app.request("/api/diaries", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ content: "auth-e2e", diaryDate: "2026-08-06" }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    const id = body.data.id;

    // 带 Cookie 读回
    const got = await app.request(`/api/diaries/${id}`, { headers: { cookie } });
    expect(got.status).toBe(200);
    expect((await got.json()).data.content).toBe("auth-e2e");
  });

  test("Bearer works for non-browser clients", async () => {
    const app = await makeAuthedApp();
    const res = await app.request("/api/auth/me", {
      headers: { authorization: `Bearer ${TEST_AUTH_TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.authenticated).toBe(true);
  });

  test("blob file route: signed link passes, plain path requires auth", async () => {
    const app = await makeAuthedApp();
    // 无签名、无凭证 → 401（中间件拦截，不落 DB）
    expect((await app.request("/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/file")).status).toBe(401);
    // 带签名参数 → 放行到 handler，由 handler 校验（此处 blob 不存在会 404，而非 401）
    const signed = await app.request(
      "/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/file?expires=9999999999&signature=bad",
    );
    expect(signed.status).not.toBe(401);
  });
});
