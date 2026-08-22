#!/usr/bin/env bun
/**
 * R2 孤儿对象清理脚本：比对 DB blobs.storagePath 与 R2 全部 key，删除无引用的对象。
 *
 * 背景：r2 模式下删除是「删库先行 + 客户端 best-effort 直发网关 DELETE」
 * （D-032：API 零 R2 网络，删除凭证由 API 签发，浏览器直发网关）。客户端失败
 * （断网/旧版 App）会留下孤儿对象，且 API 的 cleanupOrphanFiles 在 r2 模式抛 400。
 * 本脚本在本机/管理机执行，直连 R2 做对账清理。
 *
 * 用法（在 services/api 目录下）：
 *   bun scripts/orphan-cleanup-r2.ts [--dry-run]
 *
 * 环境变量：R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET、DATABASE_URL。
 */
import { parseArgs } from 'node:util'
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { blobs } from '@/modules/blob/blob.schema'

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
  console.error('错误：缺少 DATABASE_URL')
  process.exit(1)
}

const endpoint = process.env.R2_ENDPOINT ?? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`
const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
})

const THUMBNAIL_SUFFIX = '.thumb.webp'

// ---------------------------------------------------------------------------
// 1. DB 全部 storagePath
// ---------------------------------------------------------------------------

const sql = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(sql)
const dbRows = await db.select({ storagePath: blobs.storagePath }).from(blobs)
await sql.end()

const referenced = new Set(dbRows.map((r) => r.storagePath))
console.log(`DB 记录: ${referenced.size} 个 storagePath`)

// ---------------------------------------------------------------------------
// 2. R2 全部 key
// ---------------------------------------------------------------------------

async function listAllKeys(): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys.sort()
}

// ---------------------------------------------------------------------------
// 3. 判定孤儿：缩略图与原图同生命周期，原图被引用时缩略图不视为孤儿
// ---------------------------------------------------------------------------

function stripThumbSuffix(path: string): string | undefined {
  return path.endsWith(THUMBNAIL_SUFFIX) ? path.slice(0, -THUMBNAIL_SUFFIX.length) : undefined
}

function isThumbPath(path: string): boolean {
  return path.endsWith(THUMBNAIL_SUFFIX)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const allKeys = await listAllKeys()
console.log(`R2 对象总数: ${allKeys.length}`)

const orphans: string[] = []

for (const key of allKeys) {
  if (referenced.has(key)) continue
  // 缩略图：原图被引用时不视为孤儿
  const base = stripThumbSuffix(key)
  if (isThumbPath(key) && base && referenced.has(base)) continue
  orphans.push(key)
}

if (orphans.length === 0) {
  console.log('✅ 无孤儿对象，DB 与 R2 一致')
  process.exit(0)
}

console.log(`\n孤儿对象 ${orphans.length} 个（${dryRun ? 'DRY-RUN，将删除' : '待删除'}）：`)
for (const key of orphans) {
  console.log(`  ${key}`)
}

if (dryRun) {
  console.log('\n[DRY-RUN] 未实际删除，移除 --dry-run 执行清理')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 4. 删除孤儿对象
// ---------------------------------------------------------------------------

const deleted: string[] = []
const failed: Array<{ key: string; error: string }> = []

for (const key of orphans) {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    deleted.push(key)
  } catch (err) {
    failed.push({ key, error: String(err) })
  }
}

console.log(`\n完成：删除 ${deleted.length}，失败 ${failed.length}`)
if (failed.length > 0) {
  console.error('--- 失败清单 ---')
  for (const f of failed) console.error(`${f.key}: ${f.error}`)
  process.exit(1)
}
