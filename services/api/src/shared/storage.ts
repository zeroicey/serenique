import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, extname as nodeExtname, relative } from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { logger } from '@/shared/logger'

// ---------------------------------------------------------------------------
// 存储后端选择（local | r2，见 .ai/requirements/2026-08-20-object-storage-r2.md）
//
// - local（默认）：现有 BLOB_ROOT 磁盘实现，行为与迁移前完全一致。
// - r2：Cloudflare R2 对象存储，S3 协议（@aws-sdk/client-s3），key = storagePath。
//   切换仅需 STORAGE_BACKEND=r2 + R2_* 凭据；本地后端保留作回滚/迁移兜底。
//   导出函数签名不变（root 参数在 r2 模式下被忽略）——上层业务零改动。
// ---------------------------------------------------------------------------

let cachedBackend: 'local' | 'r2' | null = null

function storageBackend(): 'local' | 'r2' {
  if (cachedBackend === null) {
    cachedBackend = process.env.STORAGE_BACKEND === 'r2' ? 'r2' : 'local'
    if (cachedBackend === 'r2') logger.info('存储后端：Cloudflare R2')
  }
  return cachedBackend
}

// ---------------------------------------------------------------------------
// R2 backend — lazy S3 client（local 模式不实例化，不需要 R2 凭据）
// ---------------------------------------------------------------------------

let r2Client: S3Client | null = null
let r2Bucket = ''

function r2Backend(): { client: S3Client; bucket: string } {
  if (r2Client) return { client: r2Client, bucket: r2Bucket }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const accountId = process.env.R2_ACCOUNT_ID
  const endpoint =
    process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new Error(
      'STORAGE_BACKEND=r2 需要配置 R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET',
    )
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // @aws-sdk 的 NodeHttpHandler 不读取 HTTP_PROXY/HTTPS_PROXY 环境变量；生产容器
    // 出站强制走 mihomo 代理（host.docker.internal:7890），必须显式配 agent，否则
    // 直连 R2 会被 fake-ip DNS 劫持而超时。有代理 env 才配（本地开发直连）。
    requestHandler: buildR2Handler(),
  })
  r2Bucket = bucket
  return { client: r2Client, bucket: r2Bucket }
}

/** @smithy NodeHttpHandler；有 HTTPS_PROXY/ALL_PROXY 时套 HttpsProxyAgent。 */
function buildR2Handler() {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl)
    return new NodeHttpHandler({
      httpsAgent: agent,
      httpAgent: agent,
      connectionTimeout: 15_000,
      requestTimeout: 60_000,
    })
  }
  return new NodeHttpHandler({ connectionTimeout: 15_000, requestTimeout: 60_000 })
}

// ---------------------------------------------------------------------------
// paths (local backend only)
// ---------------------------------------------------------------------------

const BLOB_OBJECTS_DIR = 'objects'

function objectsRoot(root: string): string {
  return join(root, BLOB_OBJECTS_DIR)
}

function managedPath(root: string, filePath: string): string {
  return join(objectsRoot(root), filePath)
}

function legacyPath(root: string, filePath: string): string {
  return join(root, filePath)
}

async function existingPath(root: string, filePath: string): Promise<string> {
  const managed = managedPath(root, filePath)
  if (await Bun.file(managed).exists()) return managed
  return legacyPath(root, filePath)
}

// ---------------------------------------------------------------------------
// Lightweight image dimension extraction from binary headers.
// No external dependencies — reads just enough bytes to parse the header.
// ---------------------------------------------------------------------------

function parseJPEG(buf: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) return null
    const marker = buf[offset + 1]
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // SOF0 / SOF1 / SOF2
      if (offset + 8 > buf.length) return null
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      }
    }
    // Skip this segment: 2 bytes marker + 2 bytes length
    if (offset + 4 > buf.length) return null
    const segLen = buf.readUInt16BE(offset + 2)
    offset += 2 + segLen
  }
  return null
}

function parsePNG(buf: Buffer): { width: number; height: number } | null {
  // IHDR is always the first chunk, at offset 16 (8 sig + 4 len + 4 type)
  if (buf.length < 26) return null
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

function parseGIF(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null
  return {
    width: buf.readUInt16LE(6),
    height: buf.readUInt16LE(8),
  }
}

function parseWebP(buf: Buffer): { width: number; height: number } | null {
  // RIFF header at 0, WEBP at 8, then VP8 / VP8L / VP8X chunk
  if (buf.length < 30) return null
  const chunk = buf.subarray(12, 16).toString()
  if (chunk === 'VP8 ' || chunk === 'VP8X') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    }
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }
  return null
}

/**
 * Try to extract image dimensions from the first bytes of a buffer.
 * Supports JPEG, PNG, GIF, WebP. Returns null for unrecognized formats.
 */
export function extractImageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) return parseJPEG(buf)
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return parsePNG(buf)
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return parseGIF(buf)
  // WebP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46)
    return parseWebP(buf)

  return null
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

// ---------------------------------------------------------------------------
// Thumbnails（素材库网格缩略图，见需求「素材库图片加载优化」）
//
// 缩略图 = 原图同目录派生 key：`${storagePath}.thumb.webp`（不进 DB，删除/清理
// 靠派生规则联动）。格式 WebP q75、最长边 512px（2x 屏幕下网格瓦片足够清晰，
// 原图不动——灯箱/大图预览始终走原文件）。生成用 sharp（native，Bun 可用）。
// 懒生成：访问缩略图时才生成并持久化（存量图片也自动回填，无需迁移脚本）。
// ---------------------------------------------------------------------------

const THUMBNAIL_SUFFIX = '.thumb.webp'
/** 缩略图最长边（px）。 */
export const THUMBNAIL_MAX_EDGE = 512

/** 派生缩略图存储 key。原图 key 唯一 → 缩略图 key 唯一，无需额外索引。 */
export function thumbnailStoragePath(storagePath: string): string {
  return `${storagePath}${THUMBNAIL_SUFFIX}`
}

/** 缩略图 key → 原图 key（非法 key 返回 undefined，防误删）。 */
export function stripThumbnailSuffix(thumbPath: string): string | undefined {
  return thumbPath.endsWith(THUMBNAIL_SUFFIX)
    ? thumbPath.slice(0, -THUMBNAIL_SUFFIX.length)
    : undefined
}

export function isThumbnailPath(path: string): boolean {
  return path.endsWith(THUMBNAIL_SUFFIX)
}

/**
 * 生成缩略图（最长边 ≤ THUMBNAIL_MAX_EDGE，WebP）。
 * 解码失败/非图片 → 返回 null（调用方降级为原图/跳过，不抛错破坏主流程）。
 */
export async function generateThumbnail(buf: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp')
    return await sharp(buf)
      .resize({ width: THUMBNAIL_MAX_EDGE, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Storage path generation (backend-agnostic)
// ---------------------------------------------------------------------------

/**
 * Build a relative storage path from MIME type and file extension.
 * Format: {mime-main-type}/{YYYY}/{MM}/{uuid}{ext}
 */
export function buildStoragePath(mimeType: string, id: string, originalName: string): string {
  const now = new Date()
  const year = now.getFullYear().toString()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const type = mimeType.split('/')[0] ?? 'unknown'
  const ext = nodeExtname(originalName)
  return join(type, year, month, `${id}${ext}`)
}

// ---------------------------------------------------------------------------
// Blob root directory initialization & validation (local backend only)
// ---------------------------------------------------------------------------

/**
 * Initialize the BLOB_ROOT directory.
 * - If it doesn't exist, create it.
 * - Ensure the managed objects directory exists.
 * - Leave unrelated top-level files alone (for example macOS .DS_Store).
 * - R2 后端无本地目录概念，直接跳过。
 */
export async function initBlobRoot(root: string): Promise<void> {
  if (storageBackend() === 'r2') return

  try {
    await mkdir(root, { recursive: true })
    await mkdir(objectsRoot(root), { recursive: true })
  } catch (err) {
    throw new Error(`无法创建 BLOB_ROOT 目录: ${root} — ${String(err)}`)
  }

  logger.info({ root, objectsRoot: objectsRoot(root) }, 'BLOB_ROOT 目录初始化完成')
}

// ---------------------------------------------------------------------------
// File system helpers (local) / R2 object ops — unified exports keep the
// upstream call sites (`blob.service.ts`) backend-agnostic.
// ---------------------------------------------------------------------------

export interface SaveFileOptions {
  /** R2 对象的 Content-Type（仅 r2 后端生效；local 端不需要）。 */
  mimeType?: string
}

/** Write a buffer to disk (or R2 object), creating parent directories as needed. */
export async function saveFile(
  root: string,
  filePath: string,
  buf: Buffer,
  opts?: SaveFileOptions,
): Promise<void> {
  if (storageBackend() === 'r2') {
    const { client, bucket } = r2Backend()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: filePath,
        Body: buf,
        ...(opts?.mimeType ? { ContentType: opts.mimeType } : {}),
      }),
    )
    return
  }
  const absPath = managedPath(root, filePath)
  await mkdir(dirname(absPath), { recursive: true })
  await writeFile(absPath, buf)
}

/** Read a file from the blob store (synchronous read; internal/exports only). */
export async function readFileFromStorage(root: string, filePath: string): Promise<Buffer> {
  if (storageBackend() === 'r2') {
    const { client, bucket } = r2Backend()
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: filePath }))
    if (!res.Body) throw new Error(`文件不存在: ${filePath}`)
    return Buffer.from(await res.Body.transformToByteArray())
  }
  return readFile(await existingPath(root, filePath))
}

/** Open a file as a Blob without reading it fully into memory (local) or
 *  transitively into a Blob (r2: S3 stream must be buffered once). */
export async function openFileFromStorage(
  root: string,
  filePath: string,
): Promise<{ body: Blob; size: number }> {
  if (storageBackend() === 'r2') {
    const { client, bucket } = r2Backend()
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: filePath }))
    if (!res.Body) {
      const err = new Error(`文件不存在: ${filePath}`) as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    }
    const bytes = await res.Body.transformToByteArray()
    // 拷贝出独立 ArrayBuffer（TS 5.9 的 BlobPart 要求 ArrayBufferBacked，不能直接放
    // Uint8Array<ArrayBufferLike>，且避免共享 buffer 尾部字节被带进 Blob）。
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    const body = new Blob([ab], { type: res.ContentType ?? '' })
    return { body, size: res.ContentLength ?? bytes.length }
  }

  let body = Bun.file(managedPath(root, filePath))
  if (!(await body.exists())) {
    body = Bun.file(legacyPath(root, filePath))
  }
  if (!(await body.exists())) {
    const err = new Error(`文件不存在: ${filePath}`) as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  }
  return { body, size: body.size }
}

/** Delete a file from the blob store. Does not throw if file is missing. */
export async function deleteFileFromStorage(root: string, filePath: string): Promise<void> {
  if (storageBackend() === 'r2') {
    const { client, bucket } = r2Backend()
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: filePath }))
    } catch (err) {
      const e = err as { name?: string }
      if (e.name !== 'NoSuchKey') throw err
    }
    return
  }

  try {
    await unlink(managedPath(root, filePath))
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code !== 'ENOENT') throw err

    try {
      await unlink(legacyPath(root, filePath))
    } catch (legacyErr) {
      const legacy = legacyErr as NodeJS.ErrnoException
      if (legacy.code !== 'ENOENT') throw legacyErr
    }
  }
}

/** List every regular file under the blob store as a relative storage path. */
export async function listStoragePaths(root: string): Promise<string[]> {
  if (storageBackend() === 'r2') {
    const { client, bucket } = r2Backend()
    const keys: string[] = []
    let token: string | undefined
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
      )
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key)
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
    return keys.sort()
  }

  const paths: string[] = []
  const base = objectsRoot(root)

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOENT') return
      throw err
    }

    for (const entry of entries) {
      const absPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absPath)
        continue
      }
      if (entry.isFile()) {
        paths.push(relative(base, absPath))
      }
    }
  }

  await walk(base)
  return paths.sort()
}
