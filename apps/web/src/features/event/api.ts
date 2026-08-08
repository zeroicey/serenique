import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// 事件 API 契约（手动定义，对齐 services/api 现状）。
// EventEntry 字段：id / title / startAt / endAt / isAllDay / location / note / createdAt / updatedAt。
// 时间为 ISO 字符串；列表是时间窗口查询（?from=&to=，重叠判定），返回**裸数组**（非 {items,total}）。

export interface EventEntry {
  id: string
  title: string
  startAt: string
  endAt: string
  isAllDay: boolean
  location: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEventInput {
  title: string
  startAt: string
  endAt: string
  isAllDay?: boolean
  location?: string
  note?: string
}

export interface UpdateEventInput {
  title?: string
  startAt?: string
  endAt?: string
  isAllDay?: boolean
  location?: string
  note?: string
}

// 列表返回裸数组（时间窗口查询，无分页）——不要套 Paged<T>。
export async function listEvents(from: string, to: string): Promise<EventEntry[]> {
  const res = await api.get(apiUrl('events'), { searchParams: { from, to } })
  return unwrap<EventEntry[]>(res)
}

export async function createEvent(input: CreateEventInput): Promise<EventEntry> {
  const res = await api.post(apiUrl('events'), { json: input })
  return unwrap<EventEntry>(res)
}

export async function getEvent(id: string): Promise<EventEntry> {
  const res = await api.get(apiUrl(`events/${id}`))
  return unwrap<EventEntry>(res)
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<EventEntry> {
  const res = await api.put(apiUrl(`events/${id}`), { json: input })
  return unwrap<EventEntry>(res)
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`events/${id}`))
  // 204 无响应体，对齐 delete 类接口的守卫。
  if (res.status === 204) return
  await unwrap(res)
}
