#!/usr/bin/env bun
/**
 * 一次性迁移脚本：本地 BLOB_ROOT volume → Cloudflare R2（幂等，可断点续传）。
 *
 * 用法（在 services/api 目录下，镜像内）：
 *   bun scripts/migrate-blobs-to-r2.ts [--dry-run]
 *
 * 行为：
 * - 遍历 {BLOB_ROOT}/objects/** 的相对路径 = storagePath = R2 key（与 DB / 读路径完全一致）
 * - ContentType：优先查 DB（blobs.storagePath → mimeType），缺失按扩展名推断（r2 后端
 *   saveFile 只在新建时带 mimeType，存量文件必须在此补上，Worker 网关靠它回 Content-Type）
 * - 幂等：先 ListObjectsV2 预载 R2 已存在 key；已存在的跳过 → 中断后重跑只补缺
 * - 输出统计到 stdout，失败清单到 stderr；有失败退出码非 0
 *
 * 环境变量：R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET、
 *           DATABASE_URL（查 mimeType），BLOB_ROOT（缺省 /data/blobs）
 *
 * 服务器执行：
 *   docker compose run --rm api bun scripts/migrate-blobs-to-r2.ts
 * 或先在容器里：bun scripts/migrate-blobs-to-r2.ts --dry-run
 */
import { readdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { parseArgs } from 'node:util'
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { blobs } from '@/modules/blob/blob.schema'

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false } },
})
const dryRun = values['dry-run'] === true

const BLOB_ROOT = process.env.BLOB_ROOT ?? '/data/blobs'
const OBJECTS_ROOT = join(BLOB_ROOT, 'objects')
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET) {
  console.error('错误：缺少 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET')
  process.exit(1)
}

const endpoint = process.env.R2_ENDPOINT ?? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`
const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
})

// ---------------------------------------------------------------------------
// 1. 本地文件清单
// ---------------------------------------------------------------------------

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(abs)))
    else if (entry.isFile()) out.push(abs)
  }
  return out
}

// ---------------------------------------------------------------------------
// 2. DB 里的 mimeType 映射（storagePath → mimeType）
// ---------------------------------------------------------------------------

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
}

function mimeFromExt(filePath: string): string {
  return EXT_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

async function loadDbMimeMap(): Promise<Map<string, string>> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.warn('警告：无 DATABASE_URL，ContentType 全部按扩展名推断')
    return new Map()
  }
  try {
    const sql = postgres(url, { max: 1 })
    const db = drizzle(sql)
    const rows = await db.select({ storagePath: blobs.storagePath, mimeType: blobs.mimeType }).from(blobs)
    await sql.end()
    return new Map(rows.map((r) => [r.storagePath, r.mimeType]))
  } catch (err) {
    console.warn(`警告：读取 DB 失败，回退扩展名推断 — ${String(err)}`)
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// 3. R2 已存在 key 集合（幂等跳过）
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
// main
// ---------------------------------------------------------------------------

const localFiles = (await walk(OBJECTS_ROOT)).sort()
const existing = await listExistingKeys()
const mimeMap = await loadDbMimeMap()

console.log(
  `本地文件 ${localFiles.length} 个，R2 已有 ${existing.size} 个对象，模式=${dryRun ? 'DRY-RUN' : '迁移'}`,
)

const skipped: string[] = []
const uploaded: string[] = []
const failed: Array<{ path: string; error: string }> = []
let totalBytes = 0

for (const abs of localFiles) {
  const storagePath = relative(OBJECTS_ROOT, abs)
  if (existing.has(storagePath)) {
    skipped.push(storagePath)
    continue
  }
  const mimeType = mimeMap.get(storagePath) ?? mimeFromExt(abs)
  try {
    const file = Bun.file(abs)
    const size = file.size
    if (dryRun) {
      totalBytes += size
      uploaded.push(storagePath)
      continue
    }
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: storagePath,
        Body: file,
        ContentType: mimeType,
      }),
    )
    totalBytes += size
    uploaded.push(storagePath)
  } catch (err) {
    failed.push({ path: storagePath, error: String(err) })
  }
}

console.log(
  `完成：新上传 ${uploaded.length}（${(totalBytes / 1024 / 1024).toFixed(2)} MB，含 skip 0）` +
    (dryRun ? ' [模拟]' : ''),
)
console.log(`跳过（已存在）${skipped.length}，失败 ${failed.length}`)
if (skipped.length > 0) {
  console.log('--- 跳过清单（前 20）---')
  console.log(skipped.slice(0, 20).join('\n'))
}
if (failed.length > 0) {
  console.error('--- 失败清单 ---')
  for (const f of failed) console.error(`${f.path}: ${f.error}`)
  process.exit(1)
}
if (dryRun) process.exit(0)