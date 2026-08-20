import { eq, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { env } from '@/env'
import { fireAuditRecord } from '@/modules/audit/audit.service'
import {
  assertBlobSize,
  assertGenericAttachmentOwnerType,
  errorMessage,
  isChecksumUniqueConflict,
  normalizeUploadedMimeType,
  requireSigningSecret,
  signaturesEqual,
  signBlobAccess,
  signR2Access,
} from '@/modules/blob/blob.domain'
import { toBlobAttachmentEntry, toPublicBlobEntry } from '@/modules/blob/blob.mappers'
import { blobAttachments, blobs } from '@/modules/blob/blob.schema'
import type {
  BlobAccessLinkEntry,
  BlobAttachmentEntry,
  BlobCleanupResult,
  BlobEntry,
  BlobFile,
  CreateBlobAccessLinkInput,
  CreateBlobAttachmentInput,
  ListBlobInput,
} from '@/modules/blob/blob.types'
import { AppError, ErrorCode } from '@/shared/errors'
import { logger } from '@/shared/logger'
import {
  buildStoragePath,
  deleteFileFromStorage,
  extractImageDimensions,
  listStoragePaths,
  openFileFromStorage,
  saveFile,
  sha256,
} from '@/shared/storage'

// ---------------------------------------------------------------------------
// Blob service — generic binary storage with SHA-256 dedup.
// Pure rules (signing, MIME sniffing, guards) live in blob.domain.ts; row→entry
// mapping in blob.mappers.ts. This file is orchestration over `db` + `@/shared/storage`
// + `@/env` (service import of env is the sanctioned pattern, see CLAUDE.md).
// ---------------------------------------------------------------------------

type BlobRow = typeof blobs.$inferSelect

export const blobService = {
  /**
   * Upload a file with SHA-256 deduplication.
   * If a file with the same checksum already exists, returns the existing
   * record without writing to disk (idempotent upload).
   */
  async upload(file: File): Promise<BlobEntry> {
    // --- size guard ---
    assertBlobSize(file.size, env.BLOB_MAX_SIZE)

    const buf = Buffer.from(await file.arrayBuffer())
    const checksum = sha256(buf)

    // --- dedup ---
    const [existing] = await db.select().from(blobs).where(eq(blobs.checksum, checksum))
    if (existing) {
      logger.info({ checksum, existingId: existing.id }, '检测到重复文件，返回已有记录')
      return toPublicBlobEntry(existing)
    }

    // --- persist to disk ---
    const id = crypto.randomUUID()
    const mimeType = normalizeUploadedMimeType(file, buf)
    const path = buildStoragePath(mimeType, id, file.name)

    await saveFile(env.BLOB_ROOT, path, buf, { mimeType })

    // --- extract image dimensions ---
    let width: number | null = null
    let height: number | null = null
    if (mimeType.startsWith('image/')) {
      const dims = extractImageDimensions(buf)
      if (dims) {
        width = dims.width
        height = dims.height
      }
    }

    // --- insert record ---
    let row: BlobRow
    try {
      ;[row] = await db
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
        .returning()
    } catch (err) {
      try {
        await deleteFileFromStorage(env.BLOB_ROOT, path)
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr, path }, '上传失败后的磁盘文件清理失败')
      }

      if (isChecksumUniqueConflict(err)) {
        const [existingAfterConflict] = await db
          .select()
          .from(blobs)
          .where(eq(blobs.checksum, checksum))
        if (existingAfterConflict) {
          logger.info(
            { checksum, existingId: existingAfterConflict.id },
            '上传时检测到 checksum 竞态冲突，返回已有记录',
          )
          return toPublicBlobEntry(existingAfterConflict)
        }
      }

      throw err
    }

    logger.info({ id, mimeType, size: file.size }, '文件上传成功')
    fireAuditRecord({
      event: 'blob.upload',
      message: '文件上传成功',
      level: 'info',
      detail: { id, fileName: file.name, mimeType, size: file.size },
    })
    return toPublicBlobEntry(row)
  },

  /** Paginated list with optional MIME type prefix filter. */
  async list(input: ListBlobInput): Promise<{ items: BlobEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize
    const where = input.mimeType ? like(blobs.mimeType, `${input.mimeType}%`) : undefined

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(blobs)
        .where(where)
        .orderBy(blobs.createdAt)
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(blobs).where(where),
    ])

    return { items: items.map(toPublicBlobEntry), total: count }
  },

  /** Get a single blob's metadata. */
  async get(id: string): Promise<BlobEntry> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
    return toPublicBlobEntry(row)
  },

  /** Open the file body + metadata needed for streaming. */
  async getFile(id: string): Promise<BlobFile> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
    const { body, size } = await openFileFromStorage(env.BLOB_ROOT, row.storagePath)
    return { body, size, mimeType: row.mimeType, filename: row.originalName }
  },

  /** Create a temporary HMAC-signed access link for a blob file. */
  async createAccessLink(
    blobId: string,
    input: CreateBlobAccessLinkInput & { baseUrl?: string },
  ): Promise<BlobAccessLinkEntry> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, blobId))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)

    const expires = Math.floor(Date.now() / 1000) + input.expiresInSeconds

    // ---- R2 直链（迁移后主路径）：签名走 Worker 网关校验，前端绕过 API 代理 ──
    // 仅当两个 R2 配置同时就绪才启用；缺任一 → 回退旧 API 代理链接（dev / 滚动期）。
    if (env.R2_ACCESS_SIGNING_SECRET && env.R2_PUBLIC_HOST) {
      const host = env.R2_PUBLIC_HOST.replace(/\/+$/, '')
      const signature = signR2Access(env.R2_ACCESS_SIGNING_SECRET, row.storagePath, expires)
      const path = `${host}/${row.storagePath}?e=${expires}&s=${signature}`
      return {
        url: path,
        path,
        expires,
        expiresAt: new Date(expires * 1000).toISOString(),
        signature,
      }
    }

    // ---- 旧 API 代理链接（无 R2 配置时的既有行为，保持不变）----
    const secret = requireSigningSecret(env.BLOB_SIGNING_SECRET)
    const signature = signBlobAccess(secret, blobId, expires)
    const params = new URLSearchParams({
      expires: expires.toString(),
      signature,
    })
    const path = `/api/blobs/${blobId}/file?${params.toString()}`
    const url = input.baseUrl ? new URL(path, input.baseUrl).toString() : path

    return {
      url,
      path,
      expires,
      expiresAt: new Date(expires * 1000).toISOString(),
      signature,
    }
  },

  /** Validate a temporary access signature for a blob file. */
  verifyAccessSignature(blobId: string, input: { expires?: string; signature?: string }): void {
    const secret = requireSigningSecret(env.BLOB_SIGNING_SECRET)
    if (!input.expires || !input.signature) {
      throw new AppError(ErrorCode.FORBIDDEN, '缺少临时访问签名', 403)
    }

    const expires = Number(input.expires)
    if (!Number.isInteger(expires) || expires <= 0) {
      throw new AppError(ErrorCode.FORBIDDEN, '临时访问签名无效', 403)
    }
    if (expires < Math.floor(Date.now() / 1000)) {
      throw new AppError(ErrorCode.FORBIDDEN, '临时访问链接已过期', 403)
    }

    const expected = signBlobAccess(secret, blobId, expires)
    if (!signaturesEqual(input.signature, expected)) {
      throw new AppError(ErrorCode.FORBIDDEN, '临时访问签名无效', 403)
    }
  },

  /** Create a business-level attachment reference for an existing blob. */
  async createAttachment(
    blobId: string,
    input: CreateBlobAttachmentInput,
  ): Promise<BlobAttachmentEntry> {
    assertGenericAttachmentOwnerType(input.ownerType)

    const [blob] = await db.select().from(blobs).where(eq(blobs.id, blobId))
    if (!blob) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)

    const [row] = await db
      .insert(blobAttachments)
      .values({
        blobId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        role: input.role ?? 'attachment',
        displayName: input.displayName ?? null,
        sortOrder: input.sortOrder ?? 0,
        metadata: input.metadata ?? {},
      })
      .returning()

    return toBlobAttachmentEntry(row)
  },

  /** List business-level attachment references for a blob. */
  async listAttachments(blobId: string): Promise<BlobAttachmentEntry[]> {
    const [blob] = await db.select().from(blobs).where(eq(blobs.id, blobId))
    if (!blob) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)

    const items = await db
      .select()
      .from(blobAttachments)
      .where(eq(blobAttachments.blobId, blobId))
      .orderBy(blobAttachments.sortOrder, blobAttachments.createdAt)
    return items.map(toBlobAttachmentEntry)
  },

  /** Delete an attachment reference only; the physical blob remains. */
  async deleteAttachment(id: string): Promise<void> {
    const [row] = await db.select().from(blobAttachments).where(eq(blobAttachments.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件关联不存在', 404)
    assertGenericAttachmentOwnerType(row.ownerType)

    await db.delete(blobAttachments).where(eq(blobAttachments.id, id))
  },

  /** Delete disk files that no blob row references. */
  async cleanupOrphanFiles(): Promise<BlobCleanupResult> {
    const [diskPaths, referencedRows] = await Promise.all([
      listStoragePaths(env.BLOB_ROOT),
      db.select({ storagePath: blobs.storagePath }).from(blobs),
    ])
    const referenced = new Set(referencedRows.map((row) => row.storagePath))
    const deleted: string[] = []
    const failed: BlobCleanupResult['failed'] = []

    for (const path of diskPaths) {
      if (referenced.has(path)) continue

      try {
        await deleteFileFromStorage(env.BLOB_ROOT, path)
        deleted.push(path)
      } catch (err) {
        failed.push({ path, message: errorMessage(err) })
      }
    }

    return { checked: diskPaths.length, deleted, failed }
  },

  /**
   * Delete physical blob only when no business references remain. Deletes DB
   * record first, then deletes the disk file best-effort.
   */
  async delete(id: string): Promise<void> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blobAttachments)
      .where(eq(blobAttachments.blobId, id))
    if (count > 0) {
      throw new AppError(ErrorCode.CONFLICT, '文件仍被业务记录引用，请先删除关联', 409)
    }

    await db.delete(blobs).where(eq(blobs.id, id))

    fireAuditRecord({
      event: 'blob.delete',
      message: '文件已删除',
      level: 'warn',
      detail: { id, fileName: row.originalName, mimeType: row.mimeType },
    })

    try {
      await deleteFileFromStorage(env.BLOB_ROOT, row.storagePath)
    } catch (err) {
      logger.error({ err, path: row.storagePath }, '磁盘文件删除失败，数据库记录已删除')
    }
  },
}
