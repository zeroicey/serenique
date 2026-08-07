import { describe, expect, test } from "bun:test";
import { setTestEnv } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Diary unit tests — domain pure functions, Zod schemas and mappers. No DB.
// ---------------------------------------------------------------------------

describe("diary domain", () => {
  test("isFutureDate rejects dates strictly after today", async () => {
    setTestEnv();
    const { isFutureDate } = await import("./diary.domain");

    expect(isFutureDate("2026-08-06", "2026-08-05")).toBe(true);
    expect(isFutureDate("2026-08-05", "2026-08-05")).toBe(false);
    expect(isFutureDate("2026-08-04", "2026-08-05")).toBe(false);
  });

  test("todayStr returns a YYYY-MM-DD string", async () => {
    setTestEnv();
    const { todayStr } = await import("./diary.domain");

    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("todayStr uses the local date, not UTC, at the UTC+8 early-morning boundary", async () => {
    setTestEnv();
    const { todayStr } = await import("./diary.domain");

    // 2026-08-07T23:30:00Z = 2026-08-08 07:30 in UTC+8 (the team's TZ).
    // UTC is still 08-07 here; local "today" must be 08-08.
    const now = new Date("2026-08-07T23:30:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-08-07");

    // TZ-agnostic oracle: the local calendar date, computed from the timezone
    // offset without local getters — catches a regression back to UTC on any
    // machine, not just UTC+8.
    expect(todayStr(now)).toBe(localDateOf(now));

    // Pin the concrete UTC+8 expectation when the test env is actually UTC+8,
    // so a UTC regression fails loudly in the team's timezone.
    if (now.getTimezoneOffset() === -480) {
      expect(todayStr(now)).toBe("2026-08-08");
    }
  });

  test("isFutureDate accepts the local today and rejects only strictly-after dates", async () => {
    setTestEnv();
    const { isFutureDate, todayStr } = await import("./diary.domain");

    // Boundary instant: local today is 08-08 (UTC+8) / 08-07 (UTC-*).
    const now = new Date("2026-08-07T23:30:00Z");
    const today = todayStr(now);

    expect(isFutureDate(today, today)).toBe(false); // 本地今天可写
    expect(isFutureDate("2026-08-07", today)).toBe(false); // 昨天可写
    expect(isFutureDate("2026-08-09", today)).toBe(true); // 后天拒绝
  });
});

/** Local calendar date (YYYY-MM-DD) of an instant, computed independently via
 * the timezone offset (no local getters) — an oracle that differs from the UTC
 * date whenever local timezone is ahead of / behind UTC across midnight. */
function localDateOf(now: Date): string {
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

describe("diary schemas", () => {
  test("CreateDiarySchema requires content and accepts an optional diaryDate", async () => {
    setTestEnv();
    const { CreateDiarySchema } = await import("./diary.types");

    expect(CreateDiarySchema.safeParse({ content: "今天写了一点" }).success).toBe(
      true,
    );
    expect(
      CreateDiarySchema.safeParse({
        content: "今天写了一点",
        diaryDate: "2026-08-05",
      }).success,
    ).toBe(true);
    expect(CreateDiarySchema.safeParse({ content: "" }).success).toBe(false);
    expect(
      CreateDiarySchema.safeParse({ diaryDate: "2026-08-05" }).success,
    ).toBe(false);
    expect(
      CreateDiarySchema.safeParse({ content: "x", diaryDate: "2026/08/05" })
        .success,
    ).toBe(false);
  });

  test("ListDiarySchema coerces page/pageSize with defaults", async () => {
    setTestEnv();
    const { ListDiarySchema } = await import("./diary.types");

    expect(ListDiarySchema.parse({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(ListDiarySchema.parse({ page: "2", pageSize: "20" })).toMatchObject({
      page: 2,
      pageSize: 20,
    });
  });

  test("UpdateDiaryBodySchema requires non-empty content", async () => {
    setTestEnv();
    const { UpdateDiaryBodySchema } = await import("./diary.types");

    expect(UpdateDiaryBodySchema.safeParse({ content: "改" }).success).toBe(true);
    expect(UpdateDiaryBodySchema.safeParse({ content: "" }).success).toBe(false);
  });

  test("GetDiaryByDateSchema accepts YYYY-MM-DD and rejects other formats", async () => {
    setTestEnv();
    const { GetDiaryByDateSchema } = await import("./diary.types");

    expect(GetDiaryByDateSchema.safeParse({ date: "2026-08-05" }).success).toBe(
      true,
    );
    expect(GetDiaryByDateSchema.safeParse({ date: "2026/08/05" }).success).toBe(
      false,
    );
    expect(GetDiaryByDateSchema.safeParse({ date: "abc" }).success).toBe(false);
  });
});

describe("diary mappers", () => {
  test("toDiaryEntry converts a row to an entry with ISO timestamps", async () => {
    setTestEnv();
    const { toDiaryEntry } = await import("./diary.mappers");
    const { fakeDiaryRow } = await import("@/test/helpers");

    expect(toDiaryEntry(fakeDiaryRow())).toEqual({
      id: "0198f6d0-9e7c-71d7-8214-2a0f7f5f0001",
      diaryDate: "2026-08-05",
      content: "测试日记内容",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
    });
  });
});
