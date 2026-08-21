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
}

interface UploadUrlEntry {
  blobId: string
  storagePath: string
  method: 'PUT'
  url: string
  expires: number
  expiresAt: string
  mode: 'direct-r2'
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

export async function uploadBlob(file: File): Promise<BlobEntry> {
  // 1) 签发直传凭据（仅 r2 后端可用；local 返回 400 → multipart 回退）
  let cred: UploadUrlEntry
  try {
    const res = await api.post(apiUrl('blobs/upload-url'), {
      json: { filename: file.name, mimeType: file.type || undefined, size: file.size },
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
  let putUrl: URL
  try {
    putUrl = new URL(cred.url)
  } catch {
    throw new Error('非法直传地址')
  }
  if (putUrl.origin !== 'https://s3.0icey.icu') {
    throw new Error('非法直传地址')
  }
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!putRes.ok) {
    throw new Error(`文件直传失败（${putRes.status}），请重试`)
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
