import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { Paged } from '@/types/api'

// 日记 API 契约（手动定义，对齐 services/api 现状）。
// DiaryEntry 字段：id / diaryDate / content / createdAt / updatedAt。

export interface DiaryEntry {
  id: string
  diaryDate: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface ListDiariesParams {
  page?: number
  pageSize?: number
}

export interface CreateDiaryInput {
  content: string
  diaryDate?: string
}

export interface UpdateDiaryInput {
  content: string
}

export async function listDiaries(params?: ListDiariesParams): Promise<Paged<DiaryEntry>> {
  const res = await api.get(apiUrl('diaries'), {
    searchParams: { page: String(params?.page ?? 1), pageSize: String(params?.pageSize ?? 50) },
  })
  return unwrap<Paged<DiaryEntry>>(res)
}

export async function getDiaryByDate(date: string): Promise<DiaryEntry | null> {
  // ky 默认 throwHttpErrors:true 会在 404 上直接 reject（早于任何 res.status 守卫），
  // 从而触发 TanStack Query 的 retry 风暴。这里对齐 auth 的 fetchAuthStatus：
  // throwHttpErrors:false 拿到响应体，把 404 映射为 null（当天无日记），其余错误照常上抛。
  const res = await api.get(apiUrl(`diaries/by-date/${date}`), { throwHttpErrors: false })
  if (res.status === 404) return null
  return unwrap<DiaryEntry>(res)
}

export async function createDiary(input: CreateDiaryInput): Promise<DiaryEntry> {
  const res = await api.post(apiUrl('diaries'), { json: input })
  return unwrap<DiaryEntry>(res)
}

export async function updateDiary(id: string, input: UpdateDiaryInput): Promise<DiaryEntry> {
  const res = await api.put(apiUrl(`diaries/${id}`), { json: input })
  return unwrap<DiaryEntry>(res)
}

export async function deleteDiary(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`diaries/${id}`))
  // 204 无响应体，对齐 deleteMoment 的守卫。
  if (res.status === 204) return
  await unwrap(res)
}
