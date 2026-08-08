import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// Blob 上传域。Moment 等业务模块通过这里上传二进制文件（跨 feature 复用点）。

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

export async function uploadBlob(file: File): Promise<BlobEntry> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(apiUrl('blobs/upload'), { body: form, timeout: 300_000 })
  return unwrap<BlobEntry>(res)
}
