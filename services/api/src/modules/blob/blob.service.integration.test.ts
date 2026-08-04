import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import {
  RUN_DB_TESTS,
  RUN_TOKEN,
  setTestEnv,
  TEST_SIGNING_SECRET,
} from "@/test/helpers";
// NOTE: no static import that pulls `@/env` (e.g. @/shared/storage) here —
// shared/storage → shared/logger → @/env, and env must be set via setTestEnv
// before @/env is first parsed. Those imports are done dynamically in tests.

// ---------------------------------------------------------------------------
// Blob service integration tests — real service + Drizzle ORM against
// PostgreSQL (docker compose test DB) and real disk under the shared test
// BLOB_ROOT set by helpers.
//
// GATED: skipped unless RUN_DB_TESTS=1. One-shot run:
//
//   cd services/api && bun run test:integration:full
//
// Each test uses distinct content so dedup / race semantics are deterministic.
// Cleanup removes blob rows; the shared pool is intentionally not closed (bun
// runs all files in one process).
// ---------------------------------------------------------------------------

/** Minimal 1×1 PNG header so dimension extraction returns (1, 1). */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0, 0, 0x0d]),
  Buffer.from("IHDR", "ascii"),
  Buffer.from([0, 0, 0, 1]),
  Buffer.from([0, 0, 0, 1]),
  Buffer.from([8, 6, 0, 0, 0]),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("IDAT", "ascii"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("IEND", "ascii"),
  Buffer.from([0, 0, 0, 0]),
  // Run-unique suffix (after the parsed header) so checksum-dedup never
  // collides with a leftover blob row from an earlier failed run.
  Buffer.from(`-${RUN_TOKEN}`, "ascii"),
]);

const DUP_BYTES = Buffer.from(`dup-content-${RUN_TOKEN}`);
const RACE_BYTES = Buffer.from(`race-content-${RUN_TOKEN}`);

setTestEnv();

const createdBlobIds: string[] = [];
// The test BLOB_ROOT forced by setTestEnv (matches what `@/env` captured).
const blobRoot = process.env.BLOB_ROOT ?? "/tmp/serenique-api-test";

describe.skipIf(!RUN_DB_TESTS)("blob service DB integration", () => {
  let blobService: typeof import("./blob.service").blobService;
  let db: typeof import("@/db/connection").db;
  let blobsTable: typeof import("./blob.schema").blobs;

  async function upload(name: string, type: string, content: Buffer) {
    const entry = await blobService.upload(
      new File([new Uint8Array(content)], name, { type }),
    );
    createdBlobIds.push(entry.id);
    return entry;
  }

  beforeAll(async () => {
    setTestEnv();
    blobService = (await import("./blob.service")).blobService;
    db = (await import("@/db/connection")).db;
    blobsTable = (await import("./blob.schema")).blobs;
  });

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdBlobIds.length === 0) return;
    // Remove any lingering attachment references before deleting blobs, so a
    // mid-run failure can never leave an FK-violating orphan behind.
    const blobAttachmentsTable = (await import("@/modules/blob/blob.schema"))
      .blobAttachments;
    await db
      .delete(blobAttachmentsTable)
      .where(inArray(blobAttachmentsTable.blobId, createdBlobIds));
    await db
      .delete(blobsTable)
      .where(inArray(blobsTable.id, createdBlobIds));
  });

  test("upload persists a file to disk and extracts PNG dimensions", async () => {
    const entry = await upload("tiny.png", "image/png", PNG_BYTES);

    expect(entry.mimeType).toBe("image/png");
    expect(entry.size).toBe(PNG_BYTES.length);
    expect(entry.width).toBe(1);
    expect(entry.height).toBe(1);
    expect(entry.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(entry).not.toHaveProperty("storagePath");

    const [row] = await db
      .select()
      .from(blobsTable)
      .where(eq(blobsTable.id, entry.id));
    expect(row).toBeDefined();
    const disk = await readFile(join(blobRoot, "objects", row.storagePath));
    expect(disk.length).toBe(PNG_BYTES.length);
  });

  test("uploading identical content returns the existing record with one disk file", async () => {
    const file = new File([DUP_BYTES], "dup.png", { type: "image/png" });
    const first = await blobService.upload(file);
    createdBlobIds.push(first.id);
    const second = await blobService.upload(file);

    expect(second.id).toBe(first.id);

    const rows = await db
      .select({ id: blobsTable.id })
      .from(blobsTable)
      .where(eq(blobsTable.id, first.id));
    expect(rows).toHaveLength(1);

    const { listStoragePaths } = await import("@/shared/storage");
    const matched = (await listStoragePaths(blobRoot)).filter((p) =>
      p.includes(first.id),
    );
    expect(matched).toHaveLength(1);
  });

  test("concurrent uploads of identical content resolve to a single record", async () => {
    const file = new File([RACE_BYTES], "race.png", { type: "image/png" });
    const [a, b] = await Promise.all([
      blobService.upload(file),
      blobService.upload(file),
    ]);
    createdBlobIds.push(a.id);

    expect(a.id).toBe(b.id);
    const rows = await db
      .select()
      .from(blobsTable)
      .where(eq(blobsTable.id, a.id));
    expect(rows).toHaveLength(1);
    const { listStoragePaths } = await import("@/shared/storage");
    const matched = (await listStoragePaths(blobRoot)).filter((p) =>
      p.includes(a.id),
    );
    expect(matched).toHaveLength(1);
  });

  test("upload detects SVG content and stores image/svg+xml", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect/>${RUN_TOKEN}</svg>`;
    const entry = await upload("photo.png", "image/png", Buffer.from(svg));

    expect(entry.mimeType).toBe("image/svg+xml");
  });

  test("delete is blocked while an attachment references the blob, then succeeds", async () => {
    const entry = await upload("protected.png", "image/png", PNG_BYTES);

    const attachment = await blobService.createAttachment(entry.id, {
      ownerType: "drive",
      ownerId: "d1",
    });

    await expect(
      blobService.delete(entry.id),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });

    await blobService.deleteAttachment(attachment.id);
    await blobService.delete(entry.id);

    const idx = createdBlobIds.indexOf(entry.id);
    if (idx !== -1) createdBlobIds.splice(idx, 1);
    await expect(blobService.get(entry.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  test("cleanupOrphanFiles removes disk files no blob row references", async () => {
    const { saveFile, listStoragePaths } = await import("@/shared/storage");
    const orphanPath = "image/2026/08/orphan-test.png";
    await saveFile(blobRoot, orphanPath, Buffer.from("orphan"));

    const result = await blobService.cleanupOrphanFiles();
    expect(result.deleted).toContain(orphanPath);

    const remaining = await listStoragePaths(blobRoot);
    expect(remaining).not.toContain(orphanPath);
  });

  test("getFile returns the body with correct metadata", async () => {
    const entry = await upload("stream.png", "image/png", PNG_BYTES);

    const file = await blobService.getFile(entry.id);
    expect(file.mimeType).toBe("image/png");
    expect(file.filename).toBe("stream.png");
    expect(file.size).toBe(PNG_BYTES.length);
    const buf = Buffer.from(await file.body.arrayBuffer());
    expect(buf.length).toBe(PNG_BYTES.length);
  });

  test("createAccessLink + verifyAccessSignature round-trip and reject forged/expired", async () => {
    const entry = await upload("signed.png", "image/png", PNG_BYTES);

    const link = await blobService.createAccessLink(entry.id, {
      expiresInSeconds: 60,
    });
    expect(link.path).toContain(`/api/blobs/${entry.id}/file?expires=`);

    const params = new URLSearchParams(link.path.split("?")[1] ?? "");
    const expires = params.get("expires")!;
    const signature = params.get("signature")!;

    // Valid signature passes.
    expect(() =>
      blobService.verifyAccessSignature(entry.id, { expires, signature }),
    ).not.toThrow();

    // Forged signature fails.
    expect(() =>
      blobService.verifyAccessSignature(entry.id, {
        expires,
        signature: "forged",
      }),
    ).toThrow();

    // Expired signature (signed with the real algorithm at a past timestamp) fails.
    const { signBlobAccess } = await import("./blob.domain");
    const past = Math.floor(Date.now() / 1000) - 100;
    const forgedPast = signBlobAccess(TEST_SIGNING_SECRET, entry.id, past);
    expect(() =>
      blobService.verifyAccessSignature(entry.id, {
        expires: String(past),
        signature: forgedPast,
      }),
    ).toThrow();
  });

  test("generic attachment API refuses the reserved moment owner type", async () => {
    const entry = await upload("reserved.png", "image/png", PNG_BYTES);

    await expect(
      blobService.createAttachment(entry.id, {
        ownerType: "moment",
        ownerId: "m1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
  });

  test("list filters by mimeType prefix and paginates", async () => {
    const img = await upload("list.png", "image/png", PNG_BYTES);
    const pdf = await upload(
      "list.pdf",
      "application/pdf",
      Buffer.from(`pdf-${RUN_TOKEN}`),
    );
    createdBlobIds.push(img.id, pdf.id);

    const images = await blobService.list({
      page: 1,
      pageSize: 100,
      mimeType: "image/",
    });
    expect(images.items.length).toBeGreaterThan(0);
    expect(images.items.every((b) => b.mimeType.startsWith("image/"))).toBe(true);
    expect(images.total).toBeGreaterThanOrEqual(1);

    const page = await blobService.list({ page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(1);
  });
});
