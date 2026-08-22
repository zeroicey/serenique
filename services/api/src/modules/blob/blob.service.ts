import { eq, inArray, like, sql } from 'drizzle-orm'
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
  signR2Delete,
  signR2Put,
} from '@/modules/blob/blob.domain'
import { toBlobAttachmentEntry, toPublicBlobEntry } from '@/modules/blob/blob.mappers'
import { blobAttachments, blobs } from '@/modules/blob/blob.schema'
import type {
  BlobAccessLinkEntry,
  BlobAttachmentEntry,
  BlobCleanupResult,
  BlobDeleteResult,
  BlobEntry,
  BlobFile,
  ConfirmUploadInput,
  CreateBlobAccessLinkInput,
  CreateBlobAttachmentInput,
  CreateUploadUrlInput,
  ListBlobInput,
  UploadUrlEntry,
} from '@/modules/blob/blob.types'
import { AppError, ErrorCode } from '@/shared/errors'
import { logger } from '@/shared/logger'
import {
  buildStoragePath,
  deleteFileFromStorage,
  extractImageDimensions,
  generateThumbnail,
  isThumbnailPath,
  listStoragePaths,
  openFileFromStorage,
  readFileFromStorage,
  saveFile,
  sha256,
  stripThumbnailSuffix,
  thumbnailStoragePath,
} from '@/shared/storage'

// ---------------------------------------------------------------------------
// Blob service — generic binary storage with SHA-256 dedup.
// Pure rules (signing, MIME sniffing, guards) live in blob.domain.ts; row→entry
// mapping in blob.mappers.ts. This file is orchestration over `db` + `@/shared/storage`
// + `@/env` (service import of env is the sanctioned pattern, see CLAUDE.md).
// ---------------------------------------------------------------------------

type BlobRow = typeof blobs.$inferSelect

/**
 * 确保缩略图存在（懒生成并持久化）：读原图 → sharp 缩略 → 写入存储。
 * 对所有存储后端一致（local/R2）；失败返回 null（调用方降级为原图/跳过）。
 * 存量图片首次请求缩略图时会走一次原图读取，之后全部命中。
 */
async function ensureThumbnail(row: BlobRow): Promise<Buffer | null> {
  const thumbPath = thumbnailStoragePath(row.storagePath)
  try {
    await openFileFromStorage(env.BLOB_ROOT, thumbPath)
    return null // 已存在，无需生成（调用方直接读）
  } catch {
    // 不存在 → 生成
  }
  try {
    const original = await readFileFromStorage(env.BLOB_ROOT, row.storagePath)
    const thumb = await generateThumbnail(original)
    if (thumb) {
      await saveFile(env.BLOB_ROOT, thumbPath, thumb, { mimeType: 'image/webp' })
      return thumb
    }
    return null
  } catch (err) {
    logger.warn({ err, id: row.id }, '缩略图生成失败，降级使用原图')
    return null
  }
}

/** 单个 blob 的业务引用数量（被 blob_attachments 引用的 blob 不可物理删除）。 */
async function countBlobRefs(blobId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(blobAttachments)
    .where(eq(blobAttachments.blobId, blobId))
  return count
}

export const blobService = {
  /**
   * Upload a file with SHA-256 deduplication.
   * If a file with the same checksum already exists, returns the existing
   * record without writing to disk (idempotent upload).
   */
  async upload(file: File): Promise<BlobEntry> {
    // r2 后端：API 容器零 R2 网络（D-032），旧 multipart 上传不可达 S3——
    // 直接报错引导直传，禁止容器内发起 PutObject（会挂起/超时）。
    if (env.STORAGE_BACKEND === 'r2') {
      throw new AppError(
        ErrorCode.VALIDATION,
        'R2 后端已启用直传，请使用新版客户端上传（upload-url + confirm）',
        400,
      )
    }
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

    // --- 缩略图（图片：上传即预生成，网格加载不再拉原图；失败不阻断上传）---
    if (mimeType.startsWith('image/')) {
      try {
        const thumb = await generateThumbnail(buf)
        if (thumb) {
          await saveFile(env.BLOB_ROOT, thumbnailStoragePath(path), thumb, {
            mimeType: 'image/webp',
          })
        }
      } catch (err) {
        logger.warn({ err, id }, '上传时缩略图生成失败（后续访问时懒生成重试）')
      }
    }

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

    // 引用计数：被业务附件引用的 blob 不可物理删除，素材库据此标记「在用」。
    let refCounts = new Map<string, number>()
    if (items.length > 0) {
      const refRows = await db
        .select({
          blobId: blobAttachments.blobId,
          count: sql<number>`count(*)::int`,
        })
        .from(blobAttachments)
        .where(
          inArray(
            blobAttachments.blobId,
            items.map((row) => row.id),
          ),
        )
        .groupBy(blobAttachments.blobId)
      refCounts = new Map(refRows.map((row) => [row.blobId, row.count]))
    }

    return {
      items: items.map((row) => toPublicBlobEntry(row, refCounts.get(row.id) ?? 0)),
      total: count,
    }
  },

  /** 单个 blob 的业务引用数量。 */
  async get(id: string): Promise<BlobEntry> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
    return toPublicBlobEntry(row, await countBlobRefs(id))
  },

  /** Open the file body + metadata needed for streaming. */
  async getFile(id: string): Promise<BlobFile> {
    // r2 后端：读路径是 Worker 签名直链（createAccessLink），API 代理读会触发容器内
    // GetObject（D-032：API 零 R2 网络）——直接报错引导直链，禁止 S3 读。
    if (env.STORAGE_BACKEND === 'r2') {
      throw new AppError(ErrorCode.VALIDATION, 'R2 后端请使用签名直链访问文件', 400)
    }
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
    const { body, size } = await openFileFromStorage(env.BLOB_ROOT, row.storagePath)
    return { body, size, mimeType: row.mimeType, filename: row.originalName }
  },

  /**
   * 打开图片缩略图（懒生成 + 持久化，见 shared/storage.ts 的缩略图说明）。
   * 非图片类型返回 404（素材库只在图片瓦片上请求缩略图）。
   * 缩略图生成/解码失败（如异常文件）→ 降级返回原图，绝不 500。
   */
  async getThumbnail(id: string): Promise<BlobFile> {
    // r2 后端：缩略图走派生 key 的签名直链（createAccessLink kind='thumb'），
    // 代理读会触发容器内 GetObject（D-032）——直接报错引导直链。
    if (env.STORAGE_BACKEND === 'r2') {
      throw new AppError(ErrorCode.VALIDATION, 'R2 后端请使用签名直链访问缩略图', 400)
    }
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)
    if (!row.mimeType.startsWith('image/')) {
      throw new AppError(ErrorCode.NOT_FOUND, '该文件不是图片，无缩略图', 404)
    }
    await ensureThumbnail(row)
    try {
      const { body, size } = await openFileFromStorage(
        env.BLOB_ROOT,
        thumbnailStoragePath(row.storagePath),
      )
      return { body, size, mimeType: 'image/webp', filename: `${row.originalName}.thumb.webp` }
    } catch {
      // 缩略图不存在（生成失败）→ 原图降级，保证网格瓦片仍可显示。
      const { body, size } = await openFileFromStorage(env.BLOB_ROOT, row.storagePath)
      return { body, size, mimeType: row.mimeType, filename: row.originalName }
    }
  },

  /** Create a temporary HMAC-signed access link for a blob file. */
  async createAccessLink(
    blobId: string,
    input: CreateBlobAccessLinkInput & { baseUrl?: string },
  ): Promise<BlobAccessLinkEntry> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, blobId))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)

    const isThumb = input.kind === 'thumb'
    if (isThumb && !row.mimeType.startsWith('image/')) {
      throw new AppError(ErrorCode.NOT_FOUND, '该文件不是图片，无缩略图', 404)
    }

    const expires = Math.floor(Date.now() / 1000) + input.expiresInSeconds

    // ---- R2 直链（迁移后主路径）：签名走 Worker 网关校验，前端绕过 API 代理 ──
    // 仅在「后端确实是 r2」+ R2 配置齐全时才启用；local 后端/开发一律回退 API 代理
    // （否则回滚期间新增的本地 blob 会错发 R2 直链 404）。
    // 缩略图直链：签派生 key（对象由浏览器直传网关生成；缺失时前端回退原图）。
    // 注意：**不做任何 R2 读/写**（D-032：API 零 R2 网络）——签名是纯本地 HMAC。
    if (env.STORAGE_BACKEND === 'r2' && env.R2_ACCESS_SIGNING_SECRET && env.R2_PUBLIC_HOST) {
      const host = env.R2_PUBLIC_HOST.replace(/\/+$/, '')
      const storageKey = isThumb ? thumbnailStoragePath(row.storagePath) : row.storagePath
      const signature = signR2Access(env.R2_ACCESS_SIGNING_SECRET, storageKey, expires)
      const path = `${host}/${storageKey}?e=${expires}&s=${signature}`
      return {
        url: path,
        path,
        expires,
        expiresAt: new Date(expires * 1000).toISOString(),
        signature,
      }
    }

    // ---- 旧 API 代理链接（无 R2 配置时的既有行为，保持不变；缩略图加 query）----
    const secret = requireSigningSecret(env.BLOB_SIGNING_SECRET)
    const signature = signBlobAccess(secret, blobId, expires)
    const params = new URLSearchParams({
      expires: expires.toString(),
      signature,
      ...(isThumb ? { thumbnail: '1' } : {}),
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

  /**
   * r2 直传：预分配 blobId/storagePath 并签发 PUT 直传 URL（仅 r2 后端）。
   * 客户端拿 url 直接 PUT（Worker 校验后写 R2），完成后调 confirmUpload。
   * 纯签名生成，不触 DB、不触网络。
   */
  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrlEntry> {
    if (env.STORAGE_BACKEND !== 'r2') {
      throw new AppError(ErrorCode.VALIDATION, '直传上传仅在 r2 存储后端可用', 400)
    }
    if (!env.R2_ACCESS_SIGNING_SECRET || !env.R2_PUBLIC_HOST) {
      throw new AppError(ErrorCode.INTERNAL, '未配置 R2 直传凭据', 500)
    }

    assertBlobSize(input.size, env.BLOB_MAX_SIZE)

    const blobId = crypto.randomUUID()
    const mimeType = input.mimeType ?? 'application/octet-stream'
    const storagePath = buildStoragePath(mimeType, blobId, input.filename)
    const expires = Math.floor(Date.now() / 1000) + 60 * 60
    const signature = signR2Put(env.R2_ACCESS_SIGNING_SECRET, storagePath, expires, input.size)
    const host = env.R2_PUBLIC_HOST.replace(/\/+$/, '')
    const url = `${host}/${storagePath}?e=${expires}&s=${signature}`

    // ---- 图片缩略图直传凭据（可选）----
    // 浏览器先生成 canvas WebP 缩略图（thumbSize 已知），再签发派生 key
    // （`${storagePath}.thumb.webp`）的 PUT：客户端直传网关，**不经 API 容器**
    // （D-032：API 零 R2 网络）。无数据库行、无需 confirm——存在即用，
    // 缺失时前端回退原图。不做服务端生成（容器碰不到图片字节，也连不上 R2）。
    // 签名 size 必须与请求 Content-Length 严格一致（gateway.js 校验）。
    const thumbUrl =
      mimeType.startsWith('image/') && input.thumbSize !== undefined
        ? (() => {
            const thumbStoragePath = thumbnailStoragePath(storagePath)
            const thumbSignature = signR2Put(
              env.R2_ACCESS_SIGNING_SECRET,
              thumbStoragePath,
              expires,
              input.thumbSize as number,
            )
            return `${host}/${thumbStoragePath}?e=${expires}&s=${thumbSignature}`
          })()
        : undefined

    const out: UploadUrlEntry = {
      blobId,
      storagePath,
      method: 'PUT',
      url,
      expires,
      expiresAt: new Date(expires * 1000).toISOString(),
      mode: 'direct-r2',
    }
    if (thumbUrl) out.thumbUrl = thumbUrl
    return out
  },

  /**
   * 直传完成确认：按 checksum 去重，未重复则落 blobs 行（元数据由客户端上报）。
   * 不读取文件体（尺寸/checksum 由 createUploadUrl 时的大小限制 + confirm 上报约束）。
   */
  async confirmUpload(input: ConfirmUploadInput): Promise<BlobEntry> {
    // 防填错/越权：storagePath 必须包含预分配的 blobId。
    if (!input.storagePath.includes(input.blobId)) {
      throw new AppError(ErrorCode.VALIDATION, 'storagePath 与 blobId 不匹配', 400)
    }

    // 去重（按 checksum）
    const [existing] = await db.select().from(blobs).where(eq(blobs.checksum, input.checksum))
    if (existing) {
      logger.info(
        { checksum: input.checksum, existingId: existing.id },
        '直传检测到重复文件，返回已有记录',
      )
      return toPublicBlobEntry(existing)
    }

    // 幂等：同 blobId 重复 confirm（如网络重试）→ 返回既有行，避免主键冲突 500
    const [byId] = await db.select().from(blobs).where(eq(blobs.id, input.blobId))
    if (byId) {
      logger.info({ blobId: input.blobId }, '直传确认重复提交，返回既有记录')
      return toPublicBlobEntry(byId)
    }

    // 落库（直传无法离线取图宽高，暂记 null）
    let row: BlobRow
    try {
      ;[row] = await db
        .insert(blobs)
        .values({
          id: input.blobId,
          originalName: input.originalName,
          storagePath: input.storagePath,
          mimeType: input.mimeType,
          size: input.size,
          checksum: input.checksum,
          width: null,
          height: null,
        })
        .returning()
    } catch (err) {
      if (isChecksumUniqueConflict(err)) {
        const [existingAfterConflict] = await db
          .select()
          .from(blobs)
          .where(eq(blobs.checksum, input.checksum))
        if (existingAfterConflict) {
          logger.info(
            { checksum: input.checksum, existingId: existingAfterConflict.id },
            '直传确认时检测到 checksum 竞态冲突，返回已有记录',
          )
          return toPublicBlobEntry(existingAfterConflict)
        }
      }
      throw err
    }

    fireAuditRecord({
      event: 'blob.upload',
      message: '文件上传成功（直传）',
      level: 'info',
      detail: {
        id: row.id,
        fileName: input.originalName,
        mimeType: input.mimeType,
        size: input.size,
      },
    })
    return toPublicBlobEntry(row)
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
    // r2 后端：容器内 ListObjectsV2/DeleteObject 不可达（D-032）；孤儿清理
    // 需在能直连 R2 的迁移脚本环境（本机）执行，禁止在 API 进程内发起。
    if (env.STORAGE_BACKEND === 'r2') {
      throw new AppError(
        ErrorCode.VALIDATION,
        'R2 后端下孤儿清理请在迁移脚本环境（本机直连）执行',
        400,
      )
    }
    const [diskPaths, referencedRows] = await Promise.all([
      listStoragePaths(env.BLOB_ROOT),
      db.select({ storagePath: blobs.storagePath }).from(blobs),
    ])
    const referenced = new Set(referencedRows.map((row) => row.storagePath))
    const deleted: string[] = []
    const failed: BlobCleanupResult['failed'] = []

    for (const path of diskPaths) {
      if (referenced.has(path)) continue
      // 缩略图与其原图同生命周期：原图仍被引用时，缩略图不是孤儿。
      const base = stripThumbnailSuffix(path)
      if (isThumbnailPath(path) && base && referenced.has(base)) continue

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
   * record first, then deletes the file (local) or returns signed delete URLs
   * for the client to send to the R2 gateway directly (r2, D-032 零网络)。
   */
  async delete(id: string): Promise<BlobDeleteResult> {
    const [row] = await db.select().from(blobs).where(eq(blobs.id, id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '文件不存在', 404)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blobAttachments)
      .where(eq(blobAttachments.blobId, id))
    if (count > 0) {
      throw new AppError(ErrorCode.CONFLICT, '文件仍被业务记录引用，请先删除关联', 409)
    }

    // ---- r2 后端：删库前先签发删除凭证（纯本地 HMAC，零 R2 网络）----
    // 客户端拿到 deleteUrls 后直发网关 DELETE（浏览器/移动端直连 s3.0icey.icu，
    // Worker 校验 `del:` 签名后删对象）。配置缺失属部署错误，在删库前报出。
    const deleteUrls: string[] = []
    if (env.STORAGE_BACKEND === 'r2') {
      if (!env.R2_ACCESS_SIGNING_SECRET || !env.R2_PUBLIC_HOST) {
        throw new AppError(ErrorCode.INTERNAL, '未配置 R2 删除凭据', 500)
      }
      const host = env.R2_PUBLIC_HOST.replace(/\/+$/, '')
      const expires = Math.floor(Date.now() / 1000) + 60 * 60
      const signDelete = (storageKey: string) =>
        `${host}/${storageKey}?e=${expires}&s=${signR2Delete(env.R2_ACCESS_SIGNING_SECRET!, storageKey, expires)}`
      deleteUrls.push(signDelete(row.storagePath))
      // 缩略图与原图同生命周期：图片一并签发删除（缺失对象删除幂等，网关 200）。
      if (row.mimeType.startsWith('image/')) {
        deleteUrls.push(signDelete(thumbnailStoragePath(row.storagePath)))
      }
    }

    await db.delete(blobs).where(eq(blobs.id, id))

    fireAuditRecord({
      event: 'blob.delete',
      message: '文件已删除',
      level: 'warn',
      detail: { id, fileName: row.originalName, mimeType: row.mimeType },
    })

    // ---- local 后端：直接删除文件（best-effort，幂等）----
    if (env.STORAGE_BACKEND !== 'r2') {
      try {
        await deleteFileFromStorage(env.BLOB_ROOT, row.storagePath)
      } catch (err) {
        logger.error({ err, path: row.storagePath }, '磁盘文件删除失败，数据库记录已删除')
      }
      // 缩略图与原图同生命周期，一并删除（best-effort，幂等）。
      try {
        await deleteFileFromStorage(env.BLOB_ROOT, thumbnailStoragePath(row.storagePath))
      } catch (err) {
        logger.error({ err, path: 'thumb' }, '缩略图删除失败，数据库记录已删除')
      }
    }

    return { deleted: true, deleteUrls }
  },
}
