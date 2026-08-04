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
});

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
