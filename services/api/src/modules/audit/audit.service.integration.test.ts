import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  RUN_DB_TESTS,
  RUN_TOKEN,
  setTestEnv,
  TEST_AUTH_TOKEN,
  uniqueTitle,
} from "@/test/helpers";

// ---------------------------------------------------------------------------
// Audit service integration tests — real PostgreSQL (RUN_DB_TESTS=1).
//
// Covers the read chain (record → list → unread-count → mark-read) and the
// write-point hooks (auth login success/failure, auth.unauthorized per-IP
// dedup, business delete rows).
//
// Cleanup: every audit row this file creates is tracked by id and deleted in
// afterAll — the audit table is shared with the other integration files (auth
// writes login/unauthorized rows), so we never truncate or touch non-ours.
// ---------------------------------------------------------------------------

setTestEnv();

type AuditRow = typeof import("./audit.schema").auditLogs.$inferSelect;

describe.skipIf(!RUN_DB_TESTS)("audit service DB integration", () => {
  let auditService: typeof import("./audit.service").auditService;
  let db: typeof import("@/db/connection").db;
  let auditLogs: typeof import("./audit.schema").auditLogs;
  let eventService: typeof import("@/modules/event/event.service").eventService;
  let taskService: typeof import("@/modules/task/task.service").taskService;
  let createApp: typeof import("@/app").createApp;

  const createdAuditIds: string[] = [];

  function track(row: { id: string } | undefined): void {
    if (row) createdAuditIds.push(row.id);
  }

  /** Poll the DB until rows matching `where` appear (fire-and-forget writes). */
  async function waitForAuditRows(
    where: SQL | undefined,
    timeoutMs = 3000,
  ): Promise<AuditRow[]> {
    const deadline = Date.now() + timeoutMs;
    let rows: AuditRow[] = [];
    do {
      rows = where
        ? await db.select().from(auditLogs).where(where).limit(20)
        : await db.select().from(auditLogs).limit(20);
      if (rows.length > 0) return rows;
      await Bun.sleep(40);
    } while (Date.now() < deadline);
    return rows;
  }

  function makeApp() {
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

  beforeAll(async () => {
    setTestEnv();
    auditService = (await import("./audit.service")).auditService;
    db = (await import("@/db/connection")).db;
    auditLogs = (await import("./audit.schema")).auditLogs;
    eventService = (await import("@/modules/event/event.service")).eventService;
    taskService = (await import("@/modules/task/task.service")).taskService;
    createApp = (await import("@/app")).createApp;
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdAuditIds.length === 0) return;
    await db
      .delete(auditLogs)
      .where(inArray(auditLogs.id, createdAuditIds));
  });

  // ---- read chain: record → list → unread-count → mark-read ---------------

  test("record → list → unread-count → mark-read (all)", async () => {
    await auditService.record({
      event: "auth.logout",
      message: "退出登录",
      level: "info",
      detail: { it: RUN_TOKEN },
    });
    await auditService.record({
      event: "diary.delete",
      message: "日记已删除",
      level: "warn",
      detail: { it: RUN_TOKEN, n: 2 },
    });

    // list sees both, newest-first
    const listed = await auditService.list({ page: 1, pageSize: 10 });
    expect(listed.items.length).toBeGreaterThanOrEqual(2);
    expect(listed.total).toBeGreaterThanOrEqual(2);
    const tagged = listed.items.filter((e) => (e.detail as { it?: string })?.it === RUN_TOKEN);
    expect(tagged.length).toBe(2);
    expect(tagged[0].createdAt >= tagged[1].createdAt).toBe(true);
    // 时间已序列化为 ISO 字符串
    expect(new Date(tagged[0].createdAt).toISOString()).toBe(tagged[0].createdAt);

    // unread-count covers our fresh rows
    const unread = await auditService.unreadCount();
    expect(unread).toBeGreaterThanOrEqual(2);

    // mark all → our rows become read; unread-count drops (may be >0 only if a
    // concurrent file wrote after our mark, so assert on our own rows precisely)
    const markAll = await auditService.markRead({});
    expect(markAll.updatedCount).toBeGreaterThanOrEqual(2);
    const afterAll = await db
      .select({ isRead: auditLogs.isRead })
      .from(auditLogs)
      .where(
        sql`${auditLogs.detail}->>'it' = ${RUN_TOKEN} AND ${auditLogs.isRead} = false`,
      );
    expect(afterAll.length).toBe(0);
    for (const r of await db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.detail}->>'it' = ${RUN_TOKEN}`)) {
      track(r);
    }
  });

  test("mark-read with ids marks exactly those rows", async () => {
    await auditService.record({
      event: "blob.upload",
      message: "文件上传成功",
      level: "info",
      detail: { it: RUN_TOKEN, ids: true },
    });
    await auditService.record({
      event: "blob.delete",
      message: "文件已删除",
      level: "warn",
      detail: { it: RUN_TOKEN, ids: true },
    });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.detail}->>'it' = ${RUN_TOKEN} AND ${auditLogs.detail}->>'ids' = 'true'`)
      .orderBy(desc(auditLogs.createdAt));
    expect(rows.length).toBe(2);
    for (const r of rows) track(r);

    const [first] = rows;
    const res = await auditService.markRead({ ids: [first.id] });
    expect(res.updatedCount).toBe(1);

    const [afterMark] = await db
      .select()
      .from(auditLogs)
      .where(inArray(auditLogs.id, rows.map((r) => r.id)))
      .orderBy(desc(auditLogs.createdAt));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const reads = await db
      .select({ id: auditLogs.id, isRead: auditLogs.isRead })
      .from(auditLogs)
      .where(inArray(auditLogs.id, rows.map((r) => r.id)));
    const readMap = new Map(reads.map((r) => [r.id, r.isRead]));
    expect(readMap.get(first.id)).toBe(true);
    expect(readMap.get(byId.get(rows[1].id)!.id)).toBe(false);
  });

  test("list unreadOnly=true returns only unread rows", async () => {
    await auditService.record({
      event: "task.delete",
      message: "任务已删除",
      level: "warn",
      detail: { it: RUN_TOKEN, unreadOnly: true },
    });
    const [row] = await waitForAuditRows(
      sql`${auditLogs.detail}->>'it' = ${RUN_TOKEN} AND ${auditLogs.detail}->>'unreadOnly' = 'true'`,
    );
    expect(row).toBeDefined();
    track(row);

    const unreadList = await auditService.list({
      page: 1,
      pageSize: 50,
      unreadOnly: true,
    });
    expect(unreadList.items.every((e) => e.isRead === false)).toBe(true);
    expect(unreadList.items.some((e) => e.id === row.id)).toBe(true);
  });

  // ---- write-point hooks ---------------------------------------------------

  test("auth login success / failure write audit rows", async () => {
    const app = makeApp();
    const ipOk = `it-${RUN_TOKEN}-login-ok`;
    const okRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ipOk },
      body: JSON.stringify({ token: TEST_AUTH_TOKEN }),
    });
    expect(okRes.status).toBe(200);

    const okRows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.login"), eq(auditLogs.ip, ipOk)),
    );
    expect(okRows.length).toBe(1);
    expect(okRows[0].level).toBe("info");
    track(okRows[0]);

    const ipBad = `it-${RUN_TOKEN}-login-bad`;
    const badRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ipBad },
      body: JSON.stringify({ token: "wrong-token-0123456789abcdef" }),
    });
    expect(badRes.status).toBe(401);

    const badRows = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.login_failed"), eq(auditLogs.ip, ipBad)),
    );
    expect(badRows.length).toBe(1);
    expect(badRows[0].level).toBe("warn");
    track(badRows[0]);
  });

  test("auth.unauthorized is deduped per-IP within the window", async () => {
    const app = makeApp();
    const ipA = `it-${RUN_TOKEN}-unauth-a`;
    const ipB = `it-${RUN_TOKEN}-unauth-b`;

    // 同一 IP 两次 401 → 只写一条
    expect((await app.request("/api/diaries", { headers: { "cf-connecting-ip": ipA } })).status).toBe(401);
    expect((await app.request("/api/diaries", { headers: { "cf-connecting-ip": ipA } })).status).toBe(401);
    const rowsA = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.unauthorized"), eq(auditLogs.ip, ipA)),
    );
    expect(rowsA.length).toBe(1);
    expect(rowsA[0].level).toBe("warn");
    track(rowsA[0]);

    // 不同 IP → 再写一条
    expect((await app.request("/api/diaries", { headers: { "cf-connecting-ip": ipB } })).status).toBe(401);
    const rowsB = await waitForAuditRows(
      and(eq(auditLogs.event, "auth.unauthorized"), eq(auditLogs.ip, ipB)),
    );
    expect(rowsB.length).toBe(1);
    track(rowsB[0]);
  });

  test("business delete hooks write audit rows", async () => {
    // event.delete
    const ev = await eventService.create({
      title: uniqueTitle("audit-ev"),
      startAt: "2026-08-08T09:00:00.000Z",
      endAt: "2026-08-08T10:00:00.000Z",
    });
    await eventService.delete({ id: ev.id });
    const evRows = await waitForAuditRows(
      sql`${auditLogs.event} = 'event.delete' AND ${auditLogs.detail}->>'id' = ${ev.id}`,
    );
    expect(evRows.length).toBe(1);
    expect(evRows[0].level).toBe("warn");
    track(evRows[0]);

    // task.delete + task_group.delete
    const group = await taskService.createTaskGroup({ title: uniqueTitle("audit-g") });
    const task = await taskService.createTask({
      title: uniqueTitle("audit-t"),
      groupId: group.id,
    });
    await taskService.deleteTask({ id: task.id });
    const taskRows = await waitForAuditRows(
      sql`${auditLogs.event} = 'task.delete' AND ${auditLogs.detail}->>'id' = ${task.id}`,
    );
    expect(taskRows.length).toBe(1);
    track(taskRows[0]);

    await taskService.deleteTaskGroup({ id: group.id });
    const groupRows = await waitForAuditRows(
      sql`${auditLogs.event} = 'task_group.delete' AND ${auditLogs.detail}->>'id' = ${group.id}`,
    );
    expect(groupRows.length).toBe(1);
    track(groupRows[0]);
  });
});
