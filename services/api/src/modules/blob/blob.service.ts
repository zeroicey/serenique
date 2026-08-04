import { eq, like, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { blobs, blobAttachments } from "@/modules/blob/blob.schema";
import { AppError, ErrorCode } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { env } from "@/env";
import type {
  BlobAttachmentEntry,
  BlobEntry,
  CreateBlobAttachmentInput,
  BlobCleanupResult,
  BlobFile,
  ListBlobInput,
} from "@/modules/blob/blob.types";
import {
  sha256,
  buildStoragePath,
  saveFile,
  openFileFromStorage,
  deleteFileFromStorage,
  extractImageDimensions,
  listStoragePaths,
} from "@/shared/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BlobRow = typeof blobs.$inferSelect;
type NewBlobRow = typeof blobs.$inferInsert;
type BlobAttachmentRow = typeof blobAttachments.$inferSelect;
type NewBlobAttachmentRow = typeof blobAttachments.$inferInsert;

type BlobServiceEnv = Pick<typeof env, "BLOB_ROOT" | "BLOB_MAX_SIZE">;

export type BlobRepository = {
  findBlobByChecksum(checksum: string): Promise<BlobRow | undefined>;
  insertBlob(input: NewBlobRow): Promise<BlobRow>;
  listBlobs(input: ListBlobInput): Promise<{ items: BlobRow[]; total: number }>;
  listBlobStoragePaths(): Promise<string[]>;
  findBlobById(id: string): Promise<BlobRow | undefined>;
  deleteBlob(id: string): Promise<void>;
  createAttachment(input: NewBlobAttachmentRow): Promise<BlobAttachmentRow>;
  listAttachmentsByBlobId(blobId: string): Promise<BlobAttachmentRow[]>;
  countAttachmentsByBlobId(blobId: string): Promise<number>;
  findAttachmentById(id: string): Promise<BlobAttachmentRow | undefined>;
  deleteAttachment(id: string): Promise<void>;
};

export type BlobStorage = {
  sha256(buf: Buffer): string;
  buildStoragePath(mimeType: string, id: string, originalName: string): string;
  saveFile(root: string, filePath: string, buf: Buffer): Promise<void>;
  openFileFromStorage(
    root: string,
    filePath: string,
  ): Promise<{ body: Blob; size: number }>;
  deleteFileFromStorage(root: string, filePath: string): Promise<void>;
  listStoragePaths(root: string): Promise<string[]>;
  extractImageDimensions(buf: Buffer): { width: number; height: number } | null;
};

export type CreateBlobServiceDeps = {
  env: BlobServiceEnv;
  repository: BlobRepository;
  storage: BlobStorage;
  randomUUID?: () => string;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toPublicBlobEntry(row: BlobRow): BlobEntry {
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

export function toBlobAttachmentEntry(
  row: BlobAttachmentRow,
): BlobAttachmentEntry {
  return {
    id: row.id,
    blobId: row.blobId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    role: row.role,
    displayName: row.displayName,
    sortOrder: row.sortOrder,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isChecksumUniqueConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; constraint?: unknown };
  return e.code === "23505" && e.constraint === "blobs_checksum_unique";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Repository / storage adapters
// ---------------------------------------------------------------------------

const drizzleBlobRepository: BlobRepository = {
  async findBlobByChecksum(checksum: string) {
    const [row] = await db
      .select()
      .from(blobs)
      .where(eq(blobs.checksum, checksum));
    return row;
  },

  async insertBlob(input: NewBlobRow) {
    const [row] = await db.insert(blobs).values(input).returning();
    return row;
  },

  async listBlobs(input: ListBlobInput) {
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

    return { items, total: count };
  },

  async listBlobStoragePaths() {
    const rows = await db.select({ storagePath: blobs.storagePath }).from(blobs);
    return rows.map((row) => row.storagePath);
  },

  async findBlobById(id: string) {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id));
    return row;
  },

  async deleteBlob(id: string) {
    await db.delete(blobs).where(eq(blobs.id, id));
  },

  async createAttachment(input: NewBlobAttachmentRow) {
    const [row] = await db.insert(blobAttachments).values(input).returning();
    return row;
  },

  async listAttachmentsByBlobId(blobId: string) {
    return db
      .select()
      .from(blobAttachments)
      .where(eq(blobAttachments.blobId, blobId))
      .orderBy(blobAttachments.sortOrder, blobAttachments.createdAt);
  },

  async countAttachmentsByBlobId(blobId: string) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blobAttachments)
      .where(eq(blobAttachments.blobId, blobId));
    return count;
  },

  async findAttachmentById(id: string) {
    const [row] = await db
      .select()
      .from(blobAttachments)
      .where(eq(blobAttachments.id, id));
    return row;
  },

  async deleteAttachment(id: string) {
    await db.delete(blobAttachments).where(eq(blobAttachments.id, id));
  },
};

const localBlobStorage: BlobStorage = {
  sha256,
  buildStoragePath,
  saveFile,
  openFileFromStorage,
  deleteFileFromStorage,
  listStoragePaths,
  extractImageDimensions,
};

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createBlobService({
  env: serviceEnv,
  repository,
  storage,
  randomUUID = () => crypto.randomUUID(),
}: CreateBlobServiceDeps) {
  return {
    /**
     * Upload a file with SHA-256 deduplication.
     * If a file with the same checksum already exists, returns the existing
     * record without writing to disk (idempotent upload).
     */
    async upload(file: File): Promise<BlobEntry> {
      // --- size guard ---
      if (file.size > serviceEnv.BLOB_MAX_SIZE) {
        throw new AppError(
          ErrorCode.VALIDATION,
          `文件大小不能超过 ${Math.round(serviceEnv.BLOB_MAX_SIZE / 1024 / 1024)} MB`,
          413,
        );
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const checksum = storage.sha256(buf);

      // --- dedup ---
      const existing = await repository.findBlobByChecksum(checksum);
      if (existing) {
        logger.info({ checksum, existingId: existing.id }, "检测到重复文件，返回已有记录");
        return toPublicBlobEntry(existing);
      }

      // --- persist to disk ---
      const id = randomUUID();
      const mimeType = file.type || "application/octet-stream";
      const path = storage.buildStoragePath(mimeType, id, file.name);

      await storage.saveFile(serviceEnv.BLOB_ROOT, path, buf);

      // --- extract image dimensions ---
      let width: number | null = null;
      let height: number | null = null;
      if (mimeType.startsWith("image/")) {
        const dims = storage.extractImageDimensions(buf);
        if (dims) {
          width = dims.width;
          height = dims.height;
        }
      }

      // --- insert record ---
      let row: BlobRow;
      try {
        row = await repository.insertBlob({
          id,
          originalName: file.name,
          storagePath: path,
          mimeType,
          size: file.size,
          checksum,
          width,
          height,
        });
      } catch (err) {
        try {
          await storage.deleteFileFromStorage(serviceEnv.BLOB_ROOT, path);
        } catch (cleanupErr) {
          logger.error(
            { err: cleanupErr, path },
            "上传失败后的磁盘文件清理失败",
          );
        }

        if (isChecksumUniqueConflict(err)) {
          const existingAfterConflict =
            await repository.findBlobByChecksum(checksum);
          if (existingAfterConflict) {
            logger.info(
              { checksum, existingId: existingAfterConflict.id },
              "上传时检测到 checksum 竞态冲突，返回已有记录",
            );
            return toPublicBlobEntry(existingAfterConflict);
          }
        }

        throw err;
      }

      logger.info({ id, mimeType, size: file.size }, "文件上传成功");
      return toPublicBlobEntry(row);
    },

    /** Paginated list with optional MIME type filter. */
    async list(
      input: ListBlobInput,
    ): Promise<{ items: BlobEntry[]; total: number }> {
      const { items, total } = await repository.listBlobs(input);
      return { items: items.map(toPublicBlobEntry), total };
    },

    /** Get a single blob's metadata. */
    async get(id: string): Promise<BlobEntry> {
      const row = await repository.findBlobById(id);
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);
      return toPublicBlobEntry(row);
    },

    /** Open the file body + metadata needed for streaming. */
    async getFile(id: string): Promise<BlobFile> {
      const row = await repository.findBlobById(id);
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);
      const { body, size } = await storage.openFileFromStorage(
        serviceEnv.BLOB_ROOT,
        row.storagePath,
      );
      return { body, size, mimeType: row.mimeType, filename: row.originalName };
    },

    /** Create a business-level attachment reference for an existing blob. */
    async createAttachment(
      blobId: string,
      input: CreateBlobAttachmentInput,
    ): Promise<BlobAttachmentEntry> {
      const blob = await repository.findBlobById(blobId);
      if (!blob) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);

      const row = await repository.createAttachment({
        blobId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        role: input.role,
        displayName: input.displayName ?? null,
        sortOrder: input.sortOrder,
        metadata: input.metadata,
      });

      return toBlobAttachmentEntry(row);
    },

    /** List business-level attachment references for a blob. */
    async listAttachments(blobId: string): Promise<BlobAttachmentEntry[]> {
      const blob = await repository.findBlobById(blobId);
      if (!blob) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);

      const items = await repository.listAttachmentsByBlobId(blobId);
      return items.map(toBlobAttachmentEntry);
    },

    /** Delete an attachment reference only; the physical blob remains. */
    async deleteAttachment(id: string): Promise<void> {
      const row = await repository.findAttachmentById(id);
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件关联不存在", 404);

      await repository.deleteAttachment(id);
    },

    /** Delete disk files that no blob row references. */
    async cleanupOrphanFiles(): Promise<BlobCleanupResult> {
      const [diskPaths, referencedPaths] = await Promise.all([
        storage.listStoragePaths(serviceEnv.BLOB_ROOT),
        repository.listBlobStoragePaths(),
      ]);
      const referenced = new Set(referencedPaths);
      const deleted: string[] = [];
      const failed: BlobCleanupResult["failed"] = [];

      for (const path of diskPaths) {
        if (referenced.has(path)) continue;

        try {
          await storage.deleteFileFromStorage(serviceEnv.BLOB_ROOT, path);
          deleted.push(path);
        } catch (err) {
          failed.push({ path, message: errorMessage(err) });
        }
      }

      return { checked: diskPaths.length, deleted, failed };
    },

    /**
     * Delete physical blob only when no business references remain. Deletes DB
     * record first, then deletes the disk file best-effort.
     */
    async delete(id: string): Promise<void> {
      const row = await repository.findBlobById(id);
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, "文件不存在", 404);

      const referenceCount = await repository.countAttachmentsByBlobId(id);
      if (referenceCount > 0) {
        throw new AppError(
          ErrorCode.CONFLICT,
          "文件仍被业务记录引用，请先删除关联",
          409,
        );
      }

      await repository.deleteBlob(id);

      try {
        await storage.deleteFileFromStorage(serviceEnv.BLOB_ROOT, row.storagePath);
      } catch (err) {
        logger.error({ err, path: row.storagePath }, "磁盘文件删除失败，数据库记录已删除");
      }
    },
  };
}

export const blobService = createBlobService({
  env,
  repository: drizzleBlobRepository,
  storage: localBlobStorage,
});
