import { describe, expect, test } from "bun:test";
import { setTestEnv, TEST_AUTH_TOKEN } from "@/test/helpers";

// Bearer credential shared by every /api request below — Task 5's
// authMiddleware will require it once mounted. Carried now so the contract
// smoke tests stay green when the middleware lands.
const AUTH = { Authorization: `Bearer ${TEST_AUTH_TOKEN}` };

// ---------------------------------------------------------------------------
// REST contract smoke tests — lock the behavior most at risk from handler /
// response refactors, without needing a database:
//   - malformed JSON body → 400 (unified handleError)
//   - unknown route → unified 404 shape
//   - /health → 200
// Only DB-free request paths are exercised here; DB-backed flows are covered by
// the per-module integration tests.
// ---------------------------------------------------------------------------

setTestEnv();

describe("REST contract smoke", () => {
  async function makeApp() {
    const { createApp } = await import("@/app");
    return createApp({
      DATABASE_URL:
        "postgresql://serenique:serenique@127.0.0.1:5432/serenique",
      BLOB_ROOT: "/tmp/serenique-app-test",
      BLOB_MAX_SIZE: 104857600,
      BLOB_SIGNING_SECRET: "test-signing-secret-0123456789abcdef",
      PORT: 3000,
      NODE_ENV: "test",
      AUTH_TOKEN: TEST_AUTH_TOKEN,
    });
  }

  test("GET /health returns 200", async () => {
    const app = await makeApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ status: "ok" });
  });

  test("malformed JSON body maps to 400, not 500", async () => {
    const app = await makeApp();
    const res = await app.request("/api/moments", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: "{ not valid json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("blob attachment create with malformed JSON maps to 400 (was 500)", async () => {
    const app = await makeApp();
    const res = await app.request(
      "/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/attachments",
      {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: "{ broken",
      },
    );
    expect(res.status).toBe(400);
  });

  test("unknown route returns the unified 404 shape", async () => {
    const app = await makeApp();
    const res = await app.request("/api/nope", { headers: { ...AUTH } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("invalid UUID path params map to 400 VALIDATION, not 500", async () => {
    // Handlers validate the :id/:attachmentId param as a UUID before touching
    // the DB, so a malformed id must never surface as an unrelated 500 from a
    // database query. Regression for the moment/blob handlers, which used to
    // pass any non-empty string straight through to the service.
    const app = await makeApp();
    const badRequests: Array<{ path: string; method?: string }> = [
      { path: "/api/moments/not-a-uuid" },
      { path: "/api/tasks/not-a-uuid" },
      { path: "/api/task-groups/not-a-uuid" },
      { path: "/api/events/not-a-uuid" },
      { path: "/api/blobs/not-a-uuid" },
      { path: "/api/blobs/not-a-uuid/file" },
      { path: "/api/blob-attachments/not-a-uuid", method: "DELETE" },
      {
        path: "/api/moments/not-a-uuid/attachments/not-a-uuid",
        method: "DELETE",
      },
      { path: "/api/tags/not-a-uuid" },
      { path: "/api/tags/not-a-uuid", method: "PUT" },
      { path: "/api/tags/not-a-uuid", method: "DELETE" },
      { path: "/api/tags/not-a-uuid/attach", method: "POST" },
      { path: "/api/tags/not-a-uuid/detach", method: "DELETE" },
      { path: "/api/moments/not-a-uuid/tags", method: "POST" },
      { path: "/api/moments/not-a-uuid/tags", method: "PUT" },
      {
        path: "/api/moments/not-a-uuid/tags/not-a-uuid",
        method: "DELETE",
      },
    ];
    for (const { path, method } of badRequests) {
      const res = await app.request(path, {
        method: method ?? "GET",
        headers: { ...AUTH },
      });
      // 400 (VALIDATION), never the 500 a malformed id used to trigger once it
      // reached the database layer.
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("unauthenticated /api request → 401", async () => {
    const app = await makeApp();
    const res = await app.request("/api/moments");
    expect(res.status).toBe(401);
  });

  test("login with wrong token → 401, login with correct token sets cookie", async () => {
    const app = await makeApp();
    const bad = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "wrong-token" }),
    });
    expect(bad.status).toBe(401);

    const ok = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TEST_AUTH_TOKEN }),
    });
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("serenique_session=");
    expect(setCookie).toContain("HttpOnly");
  });
});
