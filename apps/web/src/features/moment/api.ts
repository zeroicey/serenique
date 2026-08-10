import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { Paged } from '@/types/api'

// Moment 模块 API 契约（手动定义，对齐 services/api 现状）。
// 附件走 blob 模块：先上传得 blobId，再以内联 attachments 建 Moment；文件直读 blob.fileUrl。

export interface MomentBlobEntry {
  id: string
  originalName: string
  mimeType: string
  size: number
  metadata: Record<string, unknown>
  width: number | null
  height: number | null
  duration: number | null
  createdAt: string
  fileUrl: string
}

export interface MomentAttachmentEntry {
  id: string
  blobId: string
  role: string
  displayName: string | null
  sortOrder: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  blob: MomentBlobEntry
}

export interface MomentCommentEntry {
  id: string
  momentId: string
  content: string
  createdAt: string
  updatedAt: string
}

// 位置对象（微信朋友圈式）：name / 坐标均可选，至少一个字段。
// 坐标直接存储后端返回的 GCJ-02 值，客户端不做坐标系转换。
export interface MomentLocation {
  name?: string
  latitude?: number
  longitude?: number
}

export interface MomentEntry {
  id: string
  text: string
  location: MomentLocation | null
  attachments: MomentAttachmentEntry[]
  // 列表接口 comments 恒为 []（只带数量）；详情接口内嵌完整评论。
  comments: MomentCommentEntry[]
  commentCount: number
  createdAt: string
  updatedAt: string
}

export interface MomentAttachmentInput {
  blobId: string
  displayName?: string
  sortOrder?: number
}

export interface CreateMomentInput {
  text: string
  attachments?: MomentAttachmentInput[]
  location?: MomentLocation | null
}

export interface ListMomentsParams {
  page?: number
  pageSize?: number
}

export async function listMoments(params?: ListMomentsParams): Promise<Paged<MomentEntry>> {
  const res = await api.get(apiUrl('moments'), {
    searchParams: { page: String(params?.page ?? 1), pageSize: String(params?.pageSize ?? 10) },
  })
  return unwrap<Paged<MomentEntry>>(res)
}

export async function createMoment(input: CreateMomentInput): Promise<MomentEntry> {
  const res = await api.post(apiUrl('moments'), { json: input })
  return unwrap<MomentEntry>(res)
}

export async function deleteMoment(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`moments/${id}`))
  if (res.status === 204) return
  await unwrap(res)
}

export async function removeMomentAttachment(
  momentId: string,
  attachmentId: string,
): Promise<void> {
  const res = await api.delete(apiUrl(`moments/${momentId}/attachments/${attachmentId}`))
  if (res.status === 204) return
  await unwrap(res)
}

export async function listMomentComments(momentId: string): Promise<MomentCommentEntry[]> {
  const res = await api.get(apiUrl(`moments/${momentId}/comments`))
  return unwrap<MomentCommentEntry[]>(res)
}

export async function createMomentComment(
  momentId: string,
  content: string,
): Promise<MomentCommentEntry> {
  const res = await api.post(apiUrl(`moments/${momentId}/comments`), { json: { content } })
  return unwrap<MomentCommentEntry>(res)
}

export async function deleteMomentComment(momentId: string, commentId: string): Promise<void> {
  const res = await api.delete(apiUrl(`moments/${momentId}/comments/${commentId}`))
  if (res.status === 204) return
  await unwrap(res)
}
