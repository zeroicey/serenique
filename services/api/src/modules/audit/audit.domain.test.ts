import { describe, expect, test } from "bun:test";
import { setTestEnv } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Audit domain unit tests — 401 per-IP dedup state machine, event registry and
// message building. Pure functions, no DB.
// ---------------------------------------------------------------------------

const WINDOW_MS = 10 * 60_000;

describe("401 per-IP dedup state machine", () => {
  test("no state → should record", async () => {
    setTestEnv();
    const { unauthorizedShouldRecord } = await import("./audit.domain");
    expect(unauthorizedShouldRecord(undefined, 1_000_000)).toBe(true);
  });

  test("within the window → do not record again", async () => {
    setTestEnv();
    const { unauthorizedShouldRecord } = await import("./audit.domain");
    const now = 1_000_000;
    const state = { recordedAtMs: now };
    expect(unauthorizedShouldRecord(state, now)).toBe(false);
    expect(unauthorizedShouldRecord(state, now + 1)).toBe(false);
    expect(unauthorizedShouldRecord(state, now + WINDOW_MS - 1)).toBe(false);
  });

  test("window expiry → record again (reset)", async () => {
    setTestEnv();
    const { unauthorizedShouldRecord } = await import("./audit.domain");
    const now = 1_000_000;
    const state = { recordedAtMs: now };
    expect(unauthorizedShouldRecord(state, now + WINDOW_MS)).toBe(true);
    expect(unauthorizedShouldRecord(state, now + WINDOW_MS + 1)).toBe(true);
  });

  test("unauthorizedRecord stores a fresh timestamp (window restarts)", async () => {
    setTestEnv();
    const { unauthorizedRecord } = await import("./audit.domain");
    const old = { recordedAtMs: 1_000_000 };
    expect(unauthorizedRecord(undefined, 2_000_000)).toEqual({
      recordedAtMs: 2_000_000,
    });
    expect(unauthorizedRecord(old, 3_000_000)).toEqual({
      recordedAtMs: 3_000_000,
    });
  });

  test("unauthorizedStateExpired drives Map sweep cleanup", async () => {
    setTestEnv();
    const { unauthorizedStateExpired } = await import("./audit.domain");
    const now = 1_000_000;
    const state = { recordedAtMs: now };
    expect(unauthorizedStateExpired(state, now + WINDOW_MS - 1)).toBe(false);
    expect(unauthorizedStateExpired(state, now + WINDOW_MS)).toBe(true);
  });
});

describe("event registry + message building", () => {
  test("AUDIT_EVENTS covers the full confirmed scope", async () => {
    setTestEnv();
    const { AUDIT_EVENTS } = await import("./audit.types");
    expect(AUDIT_EVENTS).toEqual([
      "auth.login",
      "auth.login_failed",
      "auth.logout",
      "auth.unauthorized",
      "blob.upload",
      "blob.delete",
      "diary.delete",
      "moment.delete",
      "task.delete",
      "task_group.delete",
      "event.delete",
    ]);
  });

  test("every event has a non-empty Chinese message", async () => {
    setTestEnv();
    const { AUDIT_EVENTS } = await import("./audit.types");
    const { EVENT_MESSAGES } = await import("./audit.domain");
    for (const event of AUDIT_EVENTS) {
      const msg = EVENT_MESSAGES[event];
      expect(msg).toBeTruthy();
      expect(msg.length).toBeGreaterThan(0);
      // 用户可见文案要求中文：至少包含一个 CJK 字符
      expect(/[一-鿿]/.test(msg)).toBe(true);
    }
  });

  test("buildEventMessage returns the registered message", async () => {
    setTestEnv();
    const { buildEventMessage } = await import("./audit.domain");
    expect(buildEventMessage("auth.login")).toBe("登录成功");
    expect(buildEventMessage("task_group.delete")).toBe("任务组已删除（含组内任务）");
  });
});
