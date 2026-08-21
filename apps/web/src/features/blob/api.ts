import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// Blob 上传域。Moment 等业务模块通过这里上传二进制文件（跨 feature 复用点）。
// 上传分两种路径，由后端决定：
//   - r2 后端（生产）：两步直传——签发 PUT 凭据 → 浏览器直连 s3.0icey.icu PUT（Worker 写 R2）
//     → 计算 SHA-256 → confirm 落库。API 容器零 R2 网络（绕开 Bun 运行时无法经 mihomo
//     代理访问 R2 的限制，见 .ai/requirements/2026-08-20-object-storage-r2.md）。
//   - local 后端（dev/回滚）：upload-url 返回 400 → 回退旧 multipart 上传。

export interface BlobEntry {
  id: string
  originalName: string
  mimeType: string
  size: number
  checksum: string
  metadata: Record<string, unknown>
  width: number | null
  height: number | null
  duration: number | null
  createdAt: string
  /** 被业务附件引用的数量；>0 时不可物理删除（删除时后端返回 409）。 */
  refCount: number
}

interface UploadUrlEntry {
  blobId: string
  storagePath: string
  method: 'PUT'
  url: string
  expires: number
  expiresAt: string
  mode: 'direct-r2'
  /** 图片缩略图 PUT 直链（可选）：浏览器生成 WebP 后直传，无需 confirm。 */
  thumbUrl?: string
}

export interface BlobAttachmentEntry {
  id: string
  blobId: string
  ownerType: string
  ownerId: string
  role: string
  displayName: string | null
  sortOrder: number
  createdAt: string
}

/** 分页列表（mimeType 为前缀过滤，如 "image/"）。 */
export async function listBlobs(input: {
  page: number
  pageSize: number
  mimeType?: string
}): Promise<{ items: BlobEntry[]; total: number }> {
  const searchParams: Record<string, string> = {
    page: String(input.page),
    pageSize: String(input.pageSize),
  }
  if (input.mimeType) searchParams.mimeType = input.mimeType
  const res = await api.get(apiUrl('blobs'), { searchParams })
  return unwrap<{ items: BlobEntry[]; total: number }>(res)
}

/** 删除物理 blob（被引用时后端 409 拒绝）。 */
export async function deleteBlob(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`blobs/${id}`))
  await unwrap(res)
}

/** 查一个 blob 的所有业务引用（删除前判断引用方）。 */
export async function listBlobAttachments(id: string): Promise<BlobAttachmentEntry[]> {
  const res = await api.get(apiUrl(`blobs/${id}/attachments`))
  return unwrap<BlobAttachmentEntry[]>(res)
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function uploadViaMultipart(file: File): Promise<BlobEntry> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(apiUrl('blobs/upload'), { body: form, timeout: 300_000 })
  return unwrap<BlobEntry>(res)
}

/** 缩略图最长边（px），与后端 THUMBNAIL_MAX_EDGE 一致。 */
const THUMB_MAX_EDGE = 512

/**
 * 浏览器端生成 WebP 缩略图（canvas 缩放 → toBlob('image/webp', 0.75)）。
 * 解码失败（HEIC/部分 SVG 等 createImageBitmap 不支持的格式）返回 null → 调用方跳过缩略图。
 */
async function generateClientThumb(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, w, h)
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.75)
      })
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

/** 校验直传 URL 域名白名单（官方网关；防御性，URL 本由后端签发）。 */
function assertAllowedPutOrigin(rawUrl: string): URL {
  let putUrl: URL
  try {
    putUrl = new URL(rawUrl)
  } catch {
    throw new Error('非法直传地址')
  }
  if (putUrl.origin !== 'https://s3.0icey.icu') {
    throw new Error('非法直传地址')
  }
  return putUrl
}

export async function uploadBlob(file: File): Promise<BlobEntry> {
  // 1) 签发直传凭据（仅 r2 后端可用；local 返回 400 → multipart 回退）
  //    图片：先本地生成缩略图（canvas→WebP），把 thumbSize 一并上报，后端为派生 key
  //    另签一个缩略图 PUT 直链（不经 API 容器，D-032：API 零 R2 网络）。
  const isImage = (file.type || 'application/octet-stream').startsWith('image/')
  const thumb = isImage ? await generateClientThumb(file) : null

  let cred: UploadUrlEntry
  try {
    const res = await api.post(apiUrl('blobs/upload-url'), {
      json: {
        filename: file.name,
        mimeType: file.type || undefined,
        size: file.size,
        ...(thumb ? { thumbSize: thumb.size } : {}),
      },
      timeout: 30_000,
    })
    cred = await unwrap<UploadUrlEntry>(res)
  } catch (e) {
    if ((e as { status?: number }).status === 400) {
      return uploadViaMultipart(file)
    }
    throw e
  }

  // 2) 浏览器直传 PUT → Worker 写 R2（fetch 自动带 Content-Length；Content-Type 决定 R2 元数据）
  //    白名单校验：仅允许官方网关域名（防御性，URL 本由后端签发）。
  const putUrl = assertAllowedPutOrigin(cred.url)
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!putRes.ok) {
    throw new Error(`文件直传失败（${putRes.status}），请重试`)
  }

  // 2b) 缩略图直传（可选；失败不阻断上传——网格瓦片会回退原图）
  if (cred.thumbUrl && thumb) {
    try {
      const thumbPutUrl = assertAllowedPutOrigin(cred.thumbUrl)
      const thumbRes = await fetch(thumbPutUrl, {
        method: 'PUT',
        body: thumb,
        headers: { 'Content-Type': 'image/webp' },
      })
      if (!thumbRes.ok) {
        console.error('缩略图直传失败，网格将回退原图', thumbRes.status)
      }
    } catch (err) {
      console.error('缩略图直传失败，网格将回退原图', err)
    }
  }

  // 3) 计算 SHA-256 并 confirm 落库（去重 + 元数据）
  const checksum = await sha256Hex(await file.arrayBuffer())
  const confRes = await api.post(apiUrl('blobs/confirm'), {
    json: {
      blobId: cred.blobId,
      storagePath: cred.storagePath,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      checksum,
    },
    timeout: 30_000,
  })
  return unwrap<BlobEntry>(confRes)
}
