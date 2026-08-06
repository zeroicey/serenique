import { describe, expect, test } from "bun:test";
import { setTestEnv, TEST_AUTH_TOKEN } from "@/test/helpers";

setTestEnv(); // 总是带默认 AUTH_TOKEN

describe("authService", () => {
  test("authenticate accepts the configured token, rejects others", async () => {
    const { authService } = await import("./auth.service");
    expect(authService.isAuthEnabled()).toBe(true);
    expect(authService.authenticate(TEST_AUTH_TOKEN)).toBe(true);
    expect(authService.authenticate("wrong")).toBe(false);
  });

  test("createSessionCookie round-trips through verifySessionCookie", async () => {
    const { authService } = await import("./auth.service");
    const cookie = authService.createSessionCookie();
    expect(authService.verifySessionCookie(cookie)).toBe(true);
    expect(authService.verifySessionCookie("garbage")).toBe(false);
  });

  test("login ok / rejected / throttled", async () => {
    const { authService } = await import("./auth.service");
    expect(await authService.login("1.2.3.4", TEST_AUTH_TOKEN, 0)).toBe("ok");
    for (let i = 0; i < 5; i++) {
      expect(await authService.login("5.6.7.8", "bad", 0)).toBe("rejected");
    }
    expect(await authService.login("5.6.7.8", TEST_AUTH_TOKEN, 0)).toBe("throttled");
  });

  test("login sweeps expired throttle entries so the map stays bounded", async () => {
    const { authService } = await import("./auth.service");
    authService._throttle.clear(); // 排除前序测试遗留的条目
    const start = 1_000_000;
    // 记录一次失败 → 产生节流条目
    await authService.login("9.9.9.9", "bad", 0, start);
    expect(authService._throttle.size).toBe(1);
    // 窗口（10 分钟）过后再次 login：首行 _sweep 应清掉过期条目
    await authService.login("9.9.9.9", TEST_AUTH_TOKEN, 0, start + 11 * 60_000);
    expect(authService._throttle.size).toBe(0);
    // 直接验证 _sweep：窗口内保留，窗口后删除
    await authService.login("8.8.8.8", "bad", 0, start);
    authService._sweep(start + 5 * 60_000);
    expect(authService._throttle.has("8.8.8.8")).toBe(true);
    authService._sweep(start + 11 * 60_000);
    expect(authService._throttle.size).toBe(0);
  });
});
