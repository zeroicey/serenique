import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  RUN_DB_TESTS,
  setTestEnv,
} from "@/test/helpers";

// ---------------------------------------------------------------------------
// Diary service integration tests — real service + Drizzle ORM against
// PostgreSQL (docker compose test DB, see docker-compose.test.yml).
//
// GATED: skipped unless RUN_DB_TESTS=1. One-shot run:
//
//   cd services/api && bun run test:integration:full
//
// diary_date is a unique key, so tests pin fixed far-past dates (2020) to avoid
// colliding with real user diaries, and beforeAll clears those dates so reruns
// are idempotent. Rows created here are removed in afterAll by id.
// ---------------------------------------------------------------------------

const TEST_DATES = [
  "2020-01-01",
  "2020-01-02",
  "2020-01-03",
  "2020-01-04",
  "2020-01-05",
  "2020-01-06",
];

setTestEnv();

const createdIds: string[] = [];

describe.skipIf(!RUN_DB_TESTS)("diary service DB integration", () => {
  let service: typeof import("./diary.service").diaryService;
  let db: typeof import("@/db/connection").db;
  let diariesTable: typeof import("./diary.schema").diaries;

  beforeAll(async () => {
    setTestEnv();
    service = (await import("./diary.service")).diaryService;
    db = (await import("@/db/connection")).db;
    diariesTable = (await import("./diary.schema")).diaries;

    // Idempotent reruns: clear any leftover test rows on the pinned dates.
    await db
      .delete(diariesTable)
      .where(inArray(diariesTable.diaryDate, TEST_DATES));
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdIds.length === 0) return;
    // Shared pool intentionally not closed (see task integration note).
    await db.delete(diariesTable).where(inArray(diariesTable.id, createdIds));
  });

  test("create with a future date rejects with 400", async () => {
    // Pinned far-future date: always strictly after local "today" in any TZ
    // and at any time of day (a UTC-tomorrow string would equal local today
    // during the UTC+8 00:00–08:00 window, see 2026-08-08 worklog).
    await expect(
      service.create({ content: "未来日记", diaryDate: "2099-01-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
  });

  test("create twice on the same date rejects with 409", async () => {
    const first = await service.create({
      content: "第一条",
      diaryDate: "2020-01-01",
    });
    createdIds.push(first.id);

    await expect(
      service.create({ content: "第二条", diaryDate: "2020-01-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 409 });
  });

  test("create / get / update / delete full cycle", async () => {
    const created = await service.create({
      content: "全流程",
      diaryDate: "2020-01-02",
    });
    createdIds.push(created.id);

    const got = await service.get({ id: created.id });
    expect(got.id).toBe(created.id);
    expect(got.content).toBe("全流程");

    const updated = await service.update({ id: created.id, content: "改过了" });
    expect(updated.content).toBe("改过了");

    const afterUpdate = await service.get({ id: created.id });
    expect(afterUpdate.content).toBe("改过了");

    await service.delete({ id: created.id });
    const idx = createdIds.indexOf(created.id);
    if (idx !== -1) createdIds.splice(idx, 1);

    await expect(service.get({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  test("list paginates and reports a total", async () => {
    const a = await service.create({ content: "分页1", diaryDate: "2020-01-03" });
    const b = await service.create({ content: "分页2", diaryDate: "2020-01-04" });
    createdIds.push(a.id, b.id);

    const result = await service.list({ page: 1, pageSize: 50 });
    expect(result.total).toBeGreaterThanOrEqual(2);
    const ours = result.items.filter((d) => d.id === a.id || d.id === b.id);
    expect(ours).toHaveLength(2);
  });

  test("get / update / delete missing entries reject with 404", async () => {
    const missing = randomUUID();
    await expect(service.get({ id: missing })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    await expect(
      service.update({ id: missing, content: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(service.delete({ id: missing })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  test("getByDate returns the entry for an existing date", async () => {
    const created = await service.create({
      content: "按日期查",
      diaryDate: "2020-01-05",
    });
    createdIds.push(created.id);

    const got = await service.getByDate({ diaryDate: "2020-01-05" });
    expect(got.id).toBe(created.id);
    expect(got.diaryDate).toBe("2020-01-05");
    expect(got.content).toBe("按日期查");
  });

  test("getByDate rejects with 404 for a missing date", async () => {
    await expect(
      service.getByDate({ diaryDate: "2020-01-06" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
