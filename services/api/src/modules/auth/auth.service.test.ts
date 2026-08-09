import { describe, expect, test } from "bun:test";
import { setTestEnv } from "@/test/helpers";

setTestEnv(); // 总是带默认 SESSION_SECRET / SETUP_TOKEN / WEBAUTHN_RP_ID

// ---------------------------------------------------------------------------
// Auth service unit tests — challenge lifecycle (内存 Map，可注入时钟) 与
// cookie 往返。所有走 DB 的路径（门禁查询、ceremony 校验）由集成测试覆盖。
// ---------------------------------------------------------------------------

describe("authService (no DB)", () => {
  test("auth is enabled when RP_ID + SESSION_SECRET configured", async () => {
    const { authService } = await import("./auth.service");
    expect(authService.isAuthEnabled()).toBe(true);
  });

  test("createSessionCookie round-trips through verifySessionCookie with userId", async () => {
    const { authService } = await import("./auth.service");
    const userId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f1001";
    const cookie = authService.createSessionCookie(userId);
    const result = authService.verifySessionCookie(cookie);
    expect(result).toEqual({ valid: true, userId });
    expect(authService.verifySessionCookie("garbage")).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  test("challenge lifecycle: issue → consume once → second consume throws", async () => {
    const { authService } = await import("./auth.service");
    authService._challenges.clear();
    const { challengeId, challenge } = authService._storeChallenge(
      { type: "login", challenge: "c1", expiresAt: 0 },
      1_000,
    );
    expect(challenge).toBe("c1");
    const rec = authService._consumeChallenge(challengeId, "login", 1_000);
    expect(rec.type).toBe("login");
    // 一次性：再次消费必须抛 AppError
    expect(() => authService._consumeChallenge(challengeId, "login", 1_000)).toThrow(
      "挑战无效或已过期",
    );
  });

  test("wrong challenge type → throws", async () => {
    const { authService } = await import("./auth.service");
    authService._challenges.clear();
    const { challengeId } = authService._storeChallenge(
      { type: "login", challenge: "c2", expiresAt: 0 },
      1_000,
    );
    expect(() => authService._consumeChallenge(challengeId, "register", 1_000)).toThrow(
      "挑战无效或已过期",
    );
  });

  test("expired challenge → throws after consume", async () => {
    const { authService } = await import("./auth.service");
    authService._challenges.clear();
    const { challengeId } = authService._storeChallenge(
      { type: "login", challenge: "c3", expiresAt: 0 },
      1_000,
    );
    // 5 分钟 TTL：2 分钟后仍有效，6 分钟后过期
    const ok = authService._consumeChallenge(challengeId, "login", 1_000 + 2 * 60_000);
    expect(ok.type).toBe("login");
    authService._challenges.clear();
    const { challengeId: cid2 } = authService._storeChallenge(
      { type: "login", challenge: "c4", expiresAt: 0 },
      1_000,
    );
    expect(() =>
      authService._consumeChallenge(cid2, "login", 1_000 + 6 * 60_000),
    ).toThrow("挑战已过期");
  });

  test("_sweepChallenges removes expired entries so the map stays bounded", async () => {
    const { authService } = await import("./auth.service");
    authService._challenges.clear();
    authService._storeChallenge({ type: "login", challenge: "s1", expiresAt: 0 }, 1_000);
    authService._storeChallenge({ type: "login", challenge: "s2", expiresAt: 0 }, 1_000);
    expect(authService._challenges.size).toBe(2);
    // 6 分钟后再次 issue → 前两条已过期被清掉
    authService._storeChallenge({ type: "login", challenge: "s3", expiresAt: 0 }, 1_000 + 6 * 60_000);
    expect(authService._challenges.size).toBe(1);
  });

  test("login throttle sweep keeps the map bounded", async () => {
    const { authService } = await import("./auth.service");
    authService._throttle.clear();
    const start = 1_000_000;
    authService._sweep(start);
    // 直接验证 _sweep：窗口内保留，窗口后删除
    authService._throttle.set("8.8.8.8", { count: 1, resetAtMs: start + 10 * 60_000 });
    authService._sweep(start + 5 * 60_000);
    expect(authService._throttle.has("8.8.8.8")).toBe(true);
    authService._sweep(start + 11 * 60_000);
    expect(authService._throttle.size).toBe(0);
  });
});
