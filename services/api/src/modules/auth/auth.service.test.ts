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
});
