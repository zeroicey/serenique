import { eq, like, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { blobs } from "@/modules/blob/blob.schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { env } from "@/env";
import type { ListBlobInput, BlobEntry } from "@/modules/blob/blob.types";
import {
  sha256,
  buildStoragePath,
  saveFile,
  readFileFromStorage,
  deleteFileFromStorage,
  extractImageDimensions,
} from "@/shared/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toPublicBlobEntry(row: typeof blobs.$inferSelect): BlobEntry {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    checksum: row.checksum,
    metadata: row.metadata as Record<string, unknown>,
    width: row.width,
    height: row.height,
    duration: row.duration,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const blobService = {
  /**
   * Upload a file with SHA-256 deduplication.
   * If a file with the same checksum already exists, returns the existing
   * record without writing to disk (idempotent upload).
   */
  async upload(file: File): Promise<BlobEntry> {
    // --- size guard ---
    if (file.size > env.BLOB_MAX_SIZE) {
      throw new AppError(
        ErrorCode.VALIDATION,
        `文件大小不能超过 ${Math.round(env.BLOB_MAX_SIZE / 1024 / 1024)} MB`,
        413,
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const checksum = sha256(buf);

    // --- dedup ---
    const [existing] = await db
      .select()
      .from(blobs)
      .where(eq(blobs.checksum, checksum));
    if (existing) {
      logger.info({ checksum, existingId: existing.id }, "检测到重复文件，返回已有记录");
      return toPublicBlobEntry(existing);
    }

    // --- persist to disk ---
    const id = crypto.randomUUID();
    const mimeType = file.type || "application/octet-stream";
    const path = buildStoragePath(mimeType, id, file.name);

    await saveFile(env.BLOB_ROOT, path, buf);

    // --- extract image dimensions ---
    let width: number | null = null;
    let height: number | null = null;
    if (mimeType.startsWith("image/")) {
      const dims = extractImageDimensions(buf);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }

    // --- insert record ---
    const [row] = await db
      .insert(blobs)
      .values({
        id,
        originalName: file.name,
        storagePath: path,
        mimeType,
        size: file.size,
        checksum,
        width,
        height,
      })
      .returning();

    logger.info({ id, mimeType, size: file.size }, "文件上传成功");
    return toPublicBlobEntry(row);
  },

  /** Paginated list with optional MIME type filter. */
  async list(
    input: ListBlobInput,
  ): Promise<{ items: BlobEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const where = input.mimeType
      ? like(blobs.mimeType, `${input.mimeType}%`)
      : undefined;

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(blobs)
        .where(where)
        .orderBy(blobs.createdAt)
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(blobs)
        .where(where),
    ]);

    return { items: items.map(toPublicBlobEntry), total: count };
  },

  /** Get a single blob's metadata. */
  async get(id: string): Promise<BlobEntry> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);
    return toPublicBlobEntry(row);
  },

  /** Read the raw file bytes + metadata needed for streaming. */
  async getFile(
    id: string,
  ): Promise<{ buf: Buffer; mimeType: string; filename: string }> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);
    const buf = await readFileFromStorage(env.BLOB_ROOT, row.storagePath);
    return { buf, mimeType: row.mimeType, filename: row.originalName };
  },

  /** Delete DB record first, then delete file from disk (best effort). */
  async delete(id: string): Promise<void> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);

    await db.delete(blobs).where(eq(blobs.id, id));

    try {
      await deleteFileFromStorage(env.BLOB_ROOT, row.storagePath);
    } catch (err) {
      logger.error({ err, path: row.storagePath }, "磁盘文件删除失败，数据库记录已删除");
    }
  },
};
