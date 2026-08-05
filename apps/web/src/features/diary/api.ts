import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import { ApiError } from '@/api/errors'
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
  const res = await api.get(apiUrl(`diaries/by-date/${date}`))
  try {
    return await unwrap<DiaryEntry>(res)
  } catch (error) {
    // 404 = 当天无日记（「无今天」态靠这个区分），其余错误上抛。
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
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
