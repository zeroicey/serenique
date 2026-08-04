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
});
