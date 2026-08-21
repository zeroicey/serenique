#!/usr/bin/env bun
/**
 * 一次性回填脚本：为 R2 中已存在的图片生成缩略图对象（`<storagePath>.thumb.webp`）。
 *
 * 背景：缩略图由**浏览器上传时**生成并直传网关（API 零 R2 网络，D-032）。存量图片
 * （本功能上线前上传的）没有缩略图对象——网格瓦片会回退原图（仍可用，只是加载慢）。
 * 本脚本在本机/管理机执行，为这些存量图补齐缩略图，之后网格即走快路径。
 *
 * 用法（在 services/api 目录下）：
 *   bun scripts/backfill-thumbs-to-r2.ts [--dry-run]
 *
 * 行为：
 * - 查 DB 取全部 image blob 的 storagePath
 * - ListObjectsV2 预载 R2 已有 key（含缩略图），已存在的跳过（幂等、可断点续传）
 * - 缺失：S3 GET 原图 → sharp 生成 512px WebP（最长边）→ PUT 到派生 key
 * - 输出统计到 stdout，失败清单到 stderr；有失败退出码非 0
 *
 * 环境变量：R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET、DATABASE_URL。
 */
import { parseArgs } from 'node:util'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { blobs } from '@/modules/blob/blob.schema'
import { thumbnailStoragePath } from '@/shared/storage'

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false } },
})
const dryRun = values['dry-run'] === true

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET
const DATABASE_URL = process.env.DATABASE_URL

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET) {
  console.error('错误：缺少 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('错误：缺少 DATABASE_URL（需查 DB 里的 image blob 清单）')
  process.exit(1)
}

const endpoint = process.env.R2_ENDPOINT ?? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`
const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
})

// ---------------------------------------------------------------------------
// 1. DB 里全部图片的 storagePath
// ---------------------------------------------------------------------------

const sql = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(sql)
const rows = await db
  .select({ storagePath: blobs.storagePath, mimeType: blobs.mimeType })
  .from(blobs)
await sql.end()

const images = rows.filter((r) => r.mimeType.startsWith('image/'))
console.log(
  `DB 图片 ${rows.filter((r) => !r.mimeType.startsWith('image/')).length} 非图片跳过，待处理 ${images.length} 个`,
)

// ---------------------------------------------------------------------------
// 2. R2 已有 key 集合（幂等跳过，含已回填的缩略图）
// ---------------------------------------------------------------------------

async function listExistingKeys(): Promise<Set<string>> {
  const keys = new Set<string>()
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.add(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

// ---------------------------------------------------------------------------
// 3. 生成缩略图（与 shared/storage.generateThumbnail 同参数；脚本内联避免依赖 API 启动）
// ---------------------------------------------------------------------------

async function makeThumb(original: Uint8Array): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp')
    return await sharp(Buffer.from(original))
      .resize({ width: 512, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const existing = await listExistingKeys()
const toBackfill = images.filter((r) => {
  const thumbKey = thumbnailStoragePath(r.storagePath)
  return !existing.has(thumbKey)
})
console.log(
  `R2 已有对象 ${existing.size} 个，缺缩略图待回填 ${toBackfill.length} 个，模式=${dryRun ? 'DRY-RUN' : '回填'}`,
)

const done: string[] = []
const failed: Array<{ path: string; error: string }> = []
const skipped = images.length - toBackfill.length

for (const { storagePath } of toBackfill) {
  const thumbKey = thumbnailStoragePath(storagePath)
  if (dryRun) {
    done.push(thumbKey)
    continue
  }
  try {
    const get = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: storagePath }))
    if (!get.Body) throw new Error('对象体为空')
    const original = new Uint8Array(await get.Body.transformToByteArray())
    const thumb = await makeThumb(original)
    if (!thumb) {
      failed.push({ path: storagePath, error: 'sharp 解码失败（非图片/损坏）' })
      continue
    }
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKey,
        Body: thumb,
        ContentType: 'image/webp',
      }),
    )
    done.push(thumbKey)
  } catch (err) {
    failed.push({ path: storagePath, error: String(err) })
  }
}

console.log(
  `完成：回填 ${done.length}，跳过（已有）${skipped}，失败 ${failed.length}` +
    (dryRun ? ' [模拟]' : ''),
)
if (failed.length > 0) {
  console.error('--- 失败清单 ---')
  for (const f of failed) console.error(`${f.path}: ${f.error}`)
  process.exit(1)
}
process.exit(dryRun ? 0 : 0)
