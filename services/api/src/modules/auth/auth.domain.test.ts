import { describe, expect, test } from "bun:test";
import {
  buildSessionCookie,
  clearSessionCookie,
  secretsEqual,
  signSessionCookie,
  throttleRecordFailure,
  throttleShouldBlock,
  verifySessionCookie,
} from "./auth.domain";

const SECRET = "0123456789abcdef0123456789abcdef"; // ≥32 chars

describe("secretsEqual", () => {
  test("rejects different values and lengths", () => {
    expect(secretsEqual("abc", "abc")).toBe(true);
    expect(secretsEqual("abc", "abd")).toBe(false);
    expect(secretsEqual("abc", "abcd")).toBe(false);
  });
});

describe("signSessionCookie / verifySessionCookie", () => {
  const exp = 1_800_000_000;
  const cookie = signSessionCookie(SECRET, exp);

  test("round-trips and expires", () => {
    expect(verifySessionCookie(SECRET, cookie, exp - 1)).toEqual({ valid: true });
    expect(verifySessionCookie(SECRET, cookie, exp + 1)).toEqual({ valid: false, reason: "expired" });
    expect(cookie.split(".").length).toBe(2);
    expect(Number(cookie.split(".")[0])).toBe(exp);
  });

  test("rejects tampering, malformed values, wrong secret", () => {
    const [, sig] = cookie.split(".");
    expect(verifySessionCookie(SECRET, `${exp + 1}.${sig}`, 1)).toEqual({ valid: false, reason: "tampered" });
    expect(verifySessionCookie(SECRET, `${exp}.xxxx`, 1)).toEqual({ valid: false, reason: "tampered" });
    expect(verifySessionCookie(SECRET, "nosig", 1)).toEqual({ valid: false, reason: "malformed" });
    expect(verifySessionCookie("yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy", cookie, exp - 1)).toEqual({ valid: false, reason: "tampered" });
  });
});

describe("buildSessionCookie", () => {
  test("sets HttpOnly + SameSite flags by mode", () => {
    const prod = buildSessionCookie("v", 3600, true, true);
    expect(prod).toContain("HttpOnly");
    expect(prod).toContain("SameSite=None");
    expect(prod).toContain("Secure");
    expect(prod).toContain("Max-Age=3600");
    const dev = buildSessionCookie("v", 3600, false, false);
    expect(dev).toContain("SameSite=Lax");
    expect(dev).not.toContain("Secure");
    expect(clearSessionCookie(true, true)).toContain("Max-Age=0");
  });
});

describe("throttle", () => {
  test("blocks only after the cap within the window", () => {
    let s: ReturnType<typeof throttleRecordFailure> | undefined;
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) s = throttleRecordFailure(s, now);
    expect(throttleShouldBlock(s, now)).toBe(false);
    s = throttleRecordFailure(s, now);
    expect(throttleShouldBlock(s, now)).toBe(true);
    expect(throttleShouldBlock(s, now + 11 * 60_000)).toBe(false); // 窗口过期
  });
});
