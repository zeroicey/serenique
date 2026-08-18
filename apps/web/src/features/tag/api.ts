import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { Paged } from '@/types/api'

// 标签模块 API 契约（手动定义，对齐 services/api 的 tag.types.ts / tag.router.ts）。
// 端点：
//   GET    /api/tags?page&pageSize   → Paged<TagEntry>
//   POST   /api/tags      {name}     → TagEntry（重名 / 并发唯一冲突 → 409）
//   PUT    /api/tags/:id  {name}     → TagEntry（重名 → 409）
//   DELETE /api/tags/:id             → 204
// 名称约束：trim + 小写归一化 + ≤32（服务端处理，存储名即显示名）。
// Moment 嵌套（GET /moments?tag / PUT /moments/:id/tags）在 features/moment/api.ts。

export interface TagEntry {
  id: string
  name: string
  /** 当前绑定该标签的闪记数（标签当前唯一 ownerType）。 */
  momentCount: number
  createdAt: string
  updatedAt: string
}

export interface ListTagsParams {
  page?: number
  pageSize?: number
}

export async function listTags(params?: ListTagsParams): Promise<Paged<TagEntry>> {
  const res = await api.get(apiUrl('tags'), {
    searchParams: {
      page: String(params?.page ?? 1),
      pageSize: String(params?.pageSize ?? 50),
    },
  })
  return unwrap<Paged<TagEntry>>(res)
}

export async function createTag(name: string): Promise<TagEntry> {
  const res = await api.post(apiUrl('tags'), { json: { name } })
  return unwrap<TagEntry>(res)
}

export async function renameTag(id: string, name: string): Promise<TagEntry> {
  const res = await api.put(apiUrl(`tags/${id}`), { json: { name } })
  return unwrap<TagEntry>(res)
}

export async function deleteTag(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`tags/${id}`))
  // 204 无响应体，对齐 delete 类接口的守卫。
  if (res.status === 204) return
  await unwrap(res)
}
