import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  RUN_DB_TESTS,
  RUN_TOKEN,
  setTestEnv,
  uniqueTitle,
} from "@/test/helpers";

// ---------------------------------------------------------------------------
// Moment service integration tests — real service + Drizzle ORM against
// PostgreSQL (docker compose test DB) and real blob uploads (disk under the
// shared test BLOB_ROOT set by helpers).
//
// GATED: skipped unless RUN_DB_TESTS=1. One-shot run:
//
//   cd services/api && bun run test:integration:full
//
// Blobs are created through the real blobService (upload → disk + DB), moments
// through momentService. Cleanup removes attachments → moments → blobs. The
// shared pool is intentionally not closed (bun runs all files in one process).
// ---------------------------------------------------------------------------

setTestEnv();

const createdMomentIds: string[] = [];
const createdBlobIds: string[] = [];

describe.skipIf(!RUN_DB_TESTS)("moment service DB integration", () => {
  let momentService: typeof import("./moment.service").momentService;
  let momentCommentService: typeof import("./comment.service").momentCommentService;
  let blobService: typeof import("@/modules/blob/blob.service").blobService;
  let db: typeof import("@/db/connection").db;
  let momentsTable: typeof import("./moment.schema").moments;
  let blobAttachmentsTable: typeof import("@/modules/blob/blob.schema").blobAttachments;
  let blobsTable: typeof import("@/modules/blob/blob.schema").blobs;

  /** Upload a real blob through blobService and track it for cleanup. */
  async function upload(name: string, type: string): Promise<string> {
    // Run-unique content so each upload is its own blob (checksum-dedup never
    // collides across tests or with leftover rows from earlier runs).
    const entry = await blobService.upload(
      new File([new TextEncoder().encode(`${name}-${RUN_TOKEN}`)], name, {
        type,
      }),
    );
    createdBlobIds.push(entry.id);
    return entry.id;
  }

  beforeAll(async () => {
    setTestEnv();
    momentService = (await import("./moment.service")).momentService;
    momentCommentService = (await import("./comment.service")).momentCommentService;
    blobService = (await import("@/modules/blob/blob.service")).blobService;
    db = (await import("@/db/connection")).db;
    momentsTable = (await import("./moment.schema")).moments;
    blobAttachmentsTable = (await import("@/modules/blob/blob.schema"))
      .blobAttachments;
    blobsTable = (await import("@/modules/blob/blob.schema")).blobs;
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS) return;
    if (createdMomentIds.length > 0) {
      await db
        .delete(blobAttachmentsTable)
        .where(
          and(
            eq(blobAttachmentsTable.ownerType, "moment"),
            inArray(blobAttachmentsTable.ownerId, createdMomentIds),
          ),
        );
      await db
        .delete(momentsTable)
        .where(inArray(momentsTable.id, createdMomentIds));
    }
    if (createdBlobIds.length > 0) {
      // Also drop any attachment rows referencing our blobs, so a mid-run
      // failure can never leave an FK-violating orphan behind.
      await db
        .delete(blobAttachmentsTable)
        .where(inArray(blobAttachmentsTable.blobId, createdBlobIds));
      await db
        .delete(blobsTable)
        .where(inArray(blobsTable.id, createdBlobIds));
    }
  });

  test("create attaches media blobs in order with nested blob info", async () => {
    const imageId = await upload("cover.png", "image/png");
    const audioId = await upload("voice.mp3", "audio/mpeg");
    const videoId = await upload("clip.mp4", "video/mp4");

    const created = await momentService.create({
      text: uniqueTitle("moment-带附件"),
      attachments: [{ blobId: imageId }, { blobId: audioId }, { blobId: videoId }],
    });
    createdMomentIds.push(created.id);

    expect(created.text).toContain("moment-带附件");
    expect(created.attachments.map((a) => a.blobId)).toEqual([
      imageId,
      audioId,
      videoId,
    ]);
    expect(created.attachments.map((a) => a.sortOrder)).toEqual([0, 1, 2]);
    expect(created.attachments[0].blob).toMatchObject({
      id: imageId,
      mimeType: "image/png",
      fileUrl: `/api/blobs/${imageId}/file`,
    });
  });

  test("create rejects disallowed mime and rolls back the whole transaction", async () => {
    const pdfId = await upload("doc.pdf", "application/pdf");
    const text = uniqueTitle("moment-非法附件");

    await expect(
      momentService.create({
        text,
        attachments: [{ blobId: pdfId }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });

    // Transaction rollback: no moment row and no attachment rows were written.
    const [orphanMoment] = await db
      .select({ id: momentsTable.id })
      .from(momentsTable)
      .where(eq(momentsTable.text, text));
    expect(orphanMoment).toBeUndefined();

    const [orphanAttachment] = await db
      .select({ id: blobAttachmentsTable.id })
      .from(blobAttachmentsTable)
      .where(eq(blobAttachmentsTable.blobId, pdfId));
    expect(orphanAttachment).toBeUndefined();
  });

  test("list returns moments with only their own attachments", async () => {
    const imageId = await upload("own.png", "image/png");
    const a = await momentService.create({
      text: uniqueTitle("moment-列表-1"),
      attachments: [{ blobId: imageId }],
    });
    const b = await momentService.create({ text: uniqueTitle("moment-列表-2") });
    createdMomentIds.push(a.id, b.id);

    const result = await momentService.list({ page: 1, pageSize: 50 });
    const ours = result.items.filter(
      (m) => m.id === a.id || m.id === b.id,
    );
    expect(ours).toHaveLength(2);
    const gotA = ours.find((m) => m.id === a.id)!;
    const gotB = ours.find((m) => m.id === b.id)!;
    expect(gotA.attachments).toHaveLength(1);
    expect(gotA.attachments[0].blobId).toBe(imageId);
    expect(gotB.attachments).toHaveLength(0);
  });

  test("list returns moments newest-first", async () => {
    const a = await momentService.create({ text: uniqueTitle("moment-排序-1") });
    const b = await momentService.create({ text: uniqueTitle("moment-排序-2") });
    const c = await momentService.create({ text: uniqueTitle("moment-排序-3") });
    createdMomentIds.push(a.id, b.id, c.id);

    // defaultNow() can land several inserts in the same ms, so pin explicit
    // distinct createdAt values (future dates guarantee our rows sort to the
    // top of the DESC-ordered page regardless of leftover rows).
    await db
      .update(momentsTable)
      .set({ createdAt: new Date("2030-01-01T00:00:00.000Z") })
      .where(eq(momentsTable.id, a.id));
    await db
      .update(momentsTable)
      .set({ createdAt: new Date("2030-01-02T00:00:00.000Z") })
      .where(eq(momentsTable.id, b.id));
    await db
      .update(momentsTable)
      .set({ createdAt: new Date("2030-01-03T00:00:00.000Z") })
      .where(eq(momentsTable.id, c.id));

    const result = await momentService.list({ page: 1, pageSize: 50 });
    const ours = result.items.filter(
      (m) => m.id === a.id || m.id === b.id || m.id === c.id,
    );
    expect(ours.map((m) => m.id)).toEqual([c.id, b.id, a.id]); // newest first
  });

  test("update modifies text and bumps updatedAt while keeping comments", async () => {
    const created = await momentService.create({
      text: uniqueTitle("moment-待更新"),
    });
    createdMomentIds.push(created.id);
    const comment = await momentCommentService.add(created.id, {
      content: "评论保留",
    });

    const updated = await momentService.update({
      id: created.id,
      text: "更新后的闪念",
    });

    expect(updated.text).toBe("更新后的闪念");
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect(updated.comments.map((c) => c.id)).toEqual([comment.id]);
    expect(updated.commentCount).toBe(1);

    const got = await momentService.get({ id: created.id });
    expect(got.text).toBe("更新后的闪念");
  });

  test("create/update round-trip location: set, keep on text-only update, clear", async () => {
    const created = await momentService.create({
      text: uniqueTitle("moment-带位置"),
      location: { name: "北京·三里屯", latitude: 39.9, longitude: 116.4 },
    });
    createdMomentIds.push(created.id);
    expect(created.location).toEqual({
      name: "北京·三里屯",
      latitude: 39.9,
      longitude: 116.4,
    });

    // Text-only PUT (old clients) keeps the location untouched.
    const textOnly = await momentService.update({
      id: created.id,
      text: "更新文本但保留位置",
    });
    expect(textOnly.location).toEqual({
      name: "北京·三里屯",
      latitude: 39.9,
      longitude: 116.4,
    });

    // Explicit null clears it.
    const cleared = await momentService.update({
      id: created.id,
      text: "清除位置",
      location: null,
    });
    expect(cleared.location).toBeNull();

    // Overwrite with a new object.
    const moved = await momentService.update({
      id: created.id,
      text: "新位置",
      location: { name: "上海·陆家嘴", latitude: 31.2, longitude: 121.5 },
    });
    expect(moved.location).toEqual({
      name: "上海·陆家嘴",
      latitude: 31.2,
      longitude: 121.5,
    });

    const got = await momentService.get({ id: created.id });
    expect(got.location).toEqual({
      name: "上海·陆家嘴",
      latitude: 31.2,
      longitude: 121.5,
    });
  });

  test("create without location defaults to null", async () => {
    const created = await momentService.create({
      text: uniqueTitle("moment-无位置"),
    });
    createdMomentIds.push(created.id);
    expect(created.location).toBeNull();
  });

  test("update rejects a missing moment", async () => {
    await expect(
      momentService.update({ id: randomUUID(), text: "不存在" }),
    ).rejects.toThrow(/闪念不存在/);
  });

  test("addAttachment appends with the next sort order", async () => {
    const imageId = await upload("one.png", "image/png");
    const videoId = await upload("two.mp4", "video/mp4");
    const created = await momentService.create({
      text: uniqueTitle("moment-追加"),
      attachments: [{ blobId: imageId }],
    });
    createdMomentIds.push(created.id);

    const added = await momentService.addAttachment(created.id, {
      blobId: videoId,
    });
    expect(added.sortOrder).toBe(1);

    const got = await momentService.get({ id: created.id });
    expect(got.attachments.map((a) => a.sortOrder)).toEqual([0, 1]);
  });

  test("deleteAttachment removes the reference but keeps the blob", async () => {
    const imageId = await upload("keep.png", "image/png");
    const created = await momentService.create({
      text: uniqueTitle("moment-删附件"),
      attachments: [{ blobId: imageId }],
    });
    createdMomentIds.push(created.id);
    const attachmentId = created.attachments[0].id;

    await momentService.deleteAttachment({
      momentId: created.id,
      attachmentId,
    });

    const got = await momentService.get({ id: created.id });
    expect(got.attachments).toHaveLength(0);
    const [blob] = await db
      .select({ id: blobsTable.id })
      .from(blobsTable)
      .where(eq(blobsTable.id, imageId));
    expect(blob).toBeDefined();
  });

  test("delete moment cascades to its attachment references", async () => {
    const imageId = await upload("cascade.png", "image/png");
    const created = await momentService.create({
      text: uniqueTitle("moment-级联"),
      attachments: [{ blobId: imageId }],
    });

    await momentService.delete({ id: created.id });

    const [attachment] = await db
      .select({ id: blobAttachmentsTable.id })
      .from(blobAttachmentsTable)
      .where(
        and(
          eq(blobAttachmentsTable.ownerType, "moment"),
          eq(blobAttachmentsTable.ownerId, created.id),
        ),
      );
    expect(attachment).toBeUndefined();

    const [blob] = await db
      .select({ id: blobsTable.id })
      .from(blobsTable)
      .where(eq(blobsTable.id, imageId));
    expect(blob).toBeDefined();
  });

  test("missing entities reject with 404", async () => {
    await expect(
      momentService.get({ id: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      momentService.addAttachment(randomUUID(), { blobId: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      momentService.delete({ id: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      momentService.deleteAttachment({
        momentId: randomUUID(),
        attachmentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  // ---- Global search (?q=) ------------------------------------------------

  /** Create a searchable moment with a pinned future createdAt for ordering. */
  async function createSearchable(
    text: string,
    createdAt: string,
  ): Promise<{ id: string; text: string }> {
    const created = await momentService.create({ text });
    createdMomentIds.push(created.id);
    await db
      .update(momentsTable)
      .set({ createdAt: new Date(createdAt) })
      .where(eq(momentsTable.id, created.id));
    return { id: created.id, text: created.text };
  }

  test("search: Chinese keyword matches text directly", async () => {
    const a = await createSearchable(
      uniqueTitle("搜索-北京天气不错"),
      "2031-01-01T00:00:00.000Z",
    );
    const b = await createSearchable(
      uniqueTitle("搜索-上海见客户"),
      "2031-01-02T00:00:00.000Z",
    );

    const result = await momentService.list({ page: 1, pageSize: 50, q: "北京" });
    const ids = result.items.map((m) => m.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  test("search: full pinyin matches pinyin column (beijing → 北京)", async () => {
    const a = await createSearchable(
      uniqueTitle("搜索-北京下雨了"),
      "2031-01-03T00:00:00.000Z",
    );
    const b = await createSearchable(
      uniqueTitle("搜索-上海有太阳"),
      "2031-01-04T00:00:00.000Z",
    );

    const result = await momentService.list({ page: 1, pageSize: 50, q: "beijing" });
    const ids = result.items.map((m) => m.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  test("search: pinyin initials match pinyin_initial column (bj → 北京)", async () => {
    const a = await createSearchable(
      uniqueTitle("搜索-北京出差"),
      "2031-01-05T00:00:00.000Z",
    );
    const b = await createSearchable(
      uniqueTitle("搜索-上海开会"),
      "2031-01-06T00:00:00.000Z",
    );

    const result = await momentService.list({ page: 1, pageSize: 50, q: "bj" });
    const ids = result.items.map((m) => m.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  test("search: English keyword matches text directly", async () => {
    const a = await createSearchable(
      uniqueTitle("搜索-meeting with team"),
      "2031-01-07T00:00:00.000Z",
    );
    const b = await createSearchable(
      uniqueTitle("搜索-lunch break"),
      "2031-01-08T00:00:00.000Z",
    );

    const result = await momentService.list({ page: 1, pageSize: 50, q: "meeting" });
    const ids = result.items.map((m) => m.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  test("search: mixed pinyin+English substring hits inside the compact run", async () => {
    const a = await createSearchable(
      uniqueTitle("搜索-北京 meeting"),
      "2031-01-09T00:00:00.000Z",
    );

    // "jing" is a substring of "beijing meeting"; "eet" spans inside "meeting".
    for (const q of ["jing", "eet"]) {
      const result = await momentService.list({ page: 1, pageSize: 50, q });
      const ids = result.items.map((m) => m.id);
      expect(ids).toContain(a.id);
    }
  });

  test("search: no match returns empty items and zero total", async () => {
    const result = await momentService.list({
      page: 1,
      pageSize: 10,
      q: uniqueTitle("搜索-绝无此词"),
    });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test("search: total reflects the filtered set and pagination still applies", async () => {
    // Marker word unique to this test's rows, so total never leaks counts from
    // other tests that also create 「北京」 moments.
    for (let i = 1; i <= 5; i++) {
      await createSearchable(
        `搜索-专用分页词-北京${i} ${RUN_TOKEN}`,
        `2032-01-0${i}T00:00:00.000Z`,
      );
    }
    const unrelated = await createSearchable(
      `搜索-上海无关词 ${RUN_TOKEN}`,
      "2032-01-06T00:00:00.000Z",
    );

    const page1 = await momentService.list({
      page: 1,
      pageSize: 2,
      q: "专用分页词",
    });
    const page3 = await momentService.list({
      page: 3,
      pageSize: 2,
      q: "专用分页词",
    });
    expect(page1.items).toHaveLength(2);
    expect(page3.items).toHaveLength(1);
    expect(page1.total).toBe(5);
    expect(page3.total).toBe(5);
    expect(page1.items.map((m) => m.id)).not.toContain(unrelated.id);
  });

  test("search: orthogonal with tag filter (q + tag)", async () => {
    const tagged = await createSearchable(
      uniqueTitle("搜索-北京带标签"),
      "2033-01-01T00:00:00.000Z",
    );
    const untagged = await createSearchable(
      uniqueTitle("搜索-北京无标签"),
      "2033-01-02T00:00:00.000Z",
    );

    const tagService = (await import("@/modules/tag/tag.service")).tagService;
    const tag = await tagService.create({ name: uniqueTitle("搜索标签") });
    await momentService.addTag(tagged.id, tag.id);

    const result = await momentService.list({
      page: 1,
      pageSize: 50,
      q: "北京",
      tag: tag.id,
    });
    const ids = result.items.map((m) => m.id);
    expect(ids).toContain(tagged.id);
    expect(ids).not.toContain(untagged.id);
    expect(result.total).toBe(1);
  });

  test("search: ILIKE wildcards % and _ are treated literally", async () => {
    const literalPercent = await createSearchable(
      `搜索-进度100%完成 ${RUN_TOKEN}`,
      "2034-01-01T00:00:00.000Z",
    );
    // Contains "100" but NOT "100%": with a broken (unescaped) pattern this
    // row would match %100%% — the escape must keep it out.
    const wildcardSink = await createSearchable(
      `搜索-100通配 ${RUN_TOKEN}`,
      "2034-01-02T00:00:00.000Z",
    );
    const literalUnderscore = await createSearchable(
      `搜索-a_b字面量 ${RUN_TOKEN}`,
      "2034-01-03T00:00:00.000Z",
    );
    // Contains "a!b" but NOT "a_b": with a broken pattern %a_b% would match.
    const underscoreSink = await createSearchable(
      `搜索-a!b字面量 ${RUN_TOKEN}`,
      "2034-01-04T00:00:00.000Z",
    );

    const pct = await momentService.list({ page: 1, pageSize: 50, q: "100%" });
    const pctIds = pct.items.map((m) => m.id);
    expect(pctIds).toContain(literalPercent.id);
    expect(pctIds).not.toContain(wildcardSink.id);

    const us = await momentService.list({ page: 1, pageSize: 50, q: "a_b" });
    const usIds = us.items.map((m) => m.id);
    expect(usIds).toContain(literalUnderscore.id);
    expect(usIds).not.toContain(underscoreSink.id);
  });

  test("search: create/update keep the pinyin columns in sync", async () => {
    const created = await momentService.create({
      text: uniqueTitle("搜索-同步北京"),
    });
    createdMomentIds.push(created.id);

    const byPinyin = await momentService.list({
      page: 1,
      pageSize: 50,
      q: "beijing",
    });
    expect(byPinyin.items.map((m) => m.id)).toContain(created.id);

    await momentService.update({ id: created.id, text: "搜索-上海新文本" });
    const stale = await momentService.list({ page: 1, pageSize: 50, q: "beijing" });
    expect(stale.items.map((m) => m.id)).not.toContain(created.id);
    const fresh = await momentService.list({ page: 1, pageSize: 50, q: "shanghai" });
    expect(fresh.items.map((m) => m.id)).toContain(created.id);
  });
});
