import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  RUN_DB_TESTS,
  RUN_TOKEN,
  setTestEnv,
  uniqueTitle,
} from "@/test/helpers";

// ---------------------------------------------------------------------------
// Moment comment service integration tests — real service + Drizzle ORM against
// PostgreSQL (docker compose test DB). GATED: skipped unless RUN_DB_TESTS=1.
//
//   cd services/api && bun run test:integration:full
//
// Cleanup deletes created moments; comments cascade via the FK (decision ⑥).
// ---------------------------------------------------------------------------

setTestEnv();

const createdMomentIds: string[] = [];

describe.skipIf(!RUN_DB_TESTS)("moment comment service DB integration", () => {
  let momentService: typeof import("./moment.service").momentService;
  let momentCommentService: typeof import("./comment.service").momentCommentService;
  let db: typeof import("@/db/connection").db;
  let momentsTable: typeof import("./moment.schema").moments;
  let momentCommentsTable: typeof import("./comment.schema").momentComments;

  /** Create a fresh moment through momentService and track it for cleanup. */
  async function createMoment(): Promise<string> {
    const created = await momentService.create({
      text: uniqueTitle("moment-评论"),
    });
    createdMomentIds.push(created.id);
    return created.id;
  }

  beforeAll(async () => {
    setTestEnv();
    momentService = (await import("./moment.service")).momentService;
    momentCommentService = (await import("./comment.service")).momentCommentService;
    db = (await import("@/db/connection")).db;
    momentsTable = (await import("./moment.schema")).moments;
    momentCommentsTable = (await import("./comment.schema")).momentComments;
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS) return;
    if (createdMomentIds.length > 0) {
      await db
        .delete(momentsTable)
        .where(inArray(momentsTable.id, createdMomentIds));
    }
  });

  test("add creates a comment and get embeds comments[] with commentCount", async () => {
    const momentId = await createMoment();

    const comment = await momentCommentService.add(momentId, {
      content: "回看：这个灵感不错",
    });
    expect(comment.momentId).toBe(momentId);
    expect(comment.content).toBe("回看：这个灵感不错");

    const got = await momentService.get({ id: momentId });
    expect(got.comments).toHaveLength(1);
    expect(got.comments[0].content).toBe("回看：这个灵感不错");
    expect(got.commentCount).toBe(1);
  });

  test("list returns comments ascending by (created_at, id)", async () => {
    const momentId = await createMoment();
    await momentCommentService.add(momentId, { content: "第一条" });
    await momentCommentService.add(momentId, { content: "第二条" });
    await momentCommentService.add(momentId, { content: "第三条" });

    const listed = await momentCommentService.list({ momentId });
    // Order is defined as (created_at ASC, id ASC) — compare against the raw
    // rows sorted that way so the assertion is timing-independent.
    const raw = await db
      .select()
      .from(momentCommentsTable)
      .where(inArray(momentCommentsTable.momentId, [momentId]));
    const sorted = [...raw].sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime();
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });

    expect(listed.map((c) => c.content)).toEqual(
      sorted.map((c) => c.content),
    );
    expect(listed).toHaveLength(3);
  });

  test("update modifies content and returns the updated entry", async () => {
    const momentId = await createMoment();
    const comment = await momentCommentService.add(momentId, {
      content: "旧内容",
    });

    const updated = await momentCommentService.update(
      { momentId, commentId: comment.id },
      { content: "新内容" },
    );
    expect(updated.content).toBe("新内容");

    const got = await momentService.get({ id: momentId });
    expect(got.comments[0].content).toBe("新内容");
  });

  test("remove deletes the comment and updates commentCount", async () => {
    const momentId = await createMoment();
    const comment = await momentCommentService.add(momentId, { content: "待删除" });

    const removed = await momentCommentService.remove({
      momentId,
      commentId: comment.id,
    });
    expect(removed.id).toBe(comment.id);

    const got = await momentService.get({ id: momentId });
    expect(got.comments).toHaveLength(0);
    expect(got.commentCount).toBe(0);
  });

  test("list embeds commentCount on moments", async () => {
    const withComments = await createMoment();
    const noComments = await createMoment();
    await momentCommentService.add(withComments, { content: "只有一条" });

    const result = await momentService.list({ page: 1, pageSize: 50 });
    const ours = result.items.filter(
      (m) => m.id === withComments || m.id === noComments,
    );
    expect(ours).toHaveLength(2);
    const gotWith = ours.find((m) => m.id === withComments)!;
    const gotNone = ours.find((m) => m.id === noComments)!;
    // List embeds commentCount but not the comment bodies.
    expect(gotWith.commentCount).toBe(1);
    expect(gotWith.comments).toEqual([]);
    expect(gotNone.commentCount).toBe(0);
  });

  test("delete moment cascades its comments via the FK", async () => {
    const momentId = await createMoment();
    await momentCommentService.add(momentId, { content: "会随闪念一起删除" });

    await momentService.delete({ id: momentId });

    const [orphan] = await db
      .select({ id: momentCommentsTable.id })
      .from(momentCommentsTable)
      .where(inArray(momentCommentsTable.momentId, [momentId]));
    expect(orphan).toBeUndefined();
  });

  test("missing entities reject with 404", async () => {
    const missingMoment = randomUUID();
    await expect(
      momentCommentService.list({ momentId: missingMoment }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      momentCommentService.add(missingMoment, { content: "不存在" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    const momentId = await createMoment();
    const missingComment = randomUUID();
    await expect(
      momentCommentService.update(
        { momentId, commentId: missingComment },
        { content: "x" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      momentCommentService.remove({ momentId, commentId: missingComment }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
