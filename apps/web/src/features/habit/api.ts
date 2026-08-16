import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// 习惯模块 API 契约（手动定义，对齐 .ai/requirements/2026-08-16-habit-module.md 第 4 节）。
// 端点：
//   GET    /api/habits                      → HabitEntry[]（裸数组，sortOrder asc）
//   POST   /api/habits                      → HabitEntry
//   PUT    /api/habits/:id                  → HabitEntry
//   DELETE /api/habits/:id                  → 204
//   GET    /api/habit-daily?date=YYYY-MM-DD → HabitDailyEntry[]（裸数组）
//   PUT    /api/habits/:habitId/daily/:date → HabitDailyEntry（upsert）
//   DELETE /api/habits/:habitId/daily/:date → 204
//   GET    /api/habit-daily/overview?days=N → HabitOverview
// 注意：习惯列表与每日状态是**裸数组**（非 {items,total}），不要套 Paged<T>。

export type HabitKind = 'good' | 'bad'
export type DailyStatus = 'done' | 'not_done'

export interface HabitEntry {
  id: string
  name: string
  /** 习惯简介（可选，如「每天晨跑 5 公里」）。 */
  description: string | null
  kind: HabitKind
  countable: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface HabitDailyEntry {
  habitId: string
  /** 做没做型：'done' | 'not_done'；null = 未记录。计数型恒 null。 */
  status: DailyStatus | null
  /** 计数型：次数（≥0）；做没做型恒 0。 */
  count: number
}

export interface CreateHabitInput {
  name: string
  kind: HabitKind
  countable?: boolean
  description?: string | null
}

export interface UpdateHabitInput {
  name?: string
  kind?: HabitKind
  countable?: boolean
  sortOrder?: number
  description?: string | null
}

/** upsert 每日状态：做没做型传 status，计数型传 count。至少一个字段。 */
export interface SetDailyInput {
  habitId: string
  date: string
  status?: DailyStatus | null
  count?: number
}

/** 总览单条记录：每日状态 + 内联习惯名/kind（契约见需求文档；name 为习惯名）。 */
export interface OverviewRecord {
  habitId: string
  name: string
  kind: HabitKind
  countable: boolean
  status: DailyStatus | null
  count: number
}

/** 总览单习惯统计。 */
export interface OverviewStat {
  habitId: string
  name: string
  kind: HabitKind
  countable: boolean
  /** 做没做型：统计期内标记「做了」的天数。 */
  doneDays: number
  /** 做没做型：统计期内标记「没做」的天数。 */
  notDoneDays: number
  /** 计数型：统计期内总次数。 */
  totalCount: number
}

export interface HabitOverview {
  days: number
  /** date(YYYY-MM-DD) → 当天记录（习惯名内联）。 */
  byDate: Record<string, OverviewRecord[]>
  stats: OverviewStat[]
}

// ---------------------------------------------------------------------------
// 习惯选项 CRUD
// ---------------------------------------------------------------------------

export async function listHabits(): Promise<HabitEntry[]> {
  const res = await api.get(apiUrl('habits'))
  return unwrap<HabitEntry[]>(res)
}

export async function createHabit(input: CreateHabitInput): Promise<HabitEntry> {
  const res = await api.post(apiUrl('habits'), { json: input })
  return unwrap<HabitEntry>(res)
}

export async function updateHabit(id: string, input: UpdateHabitInput): Promise<HabitEntry> {
  const res = await api.put(apiUrl(`habits/${id}`), { json: input })
  return unwrap<HabitEntry>(res)
}

export async function deleteHabit(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`habits/${id}`))
  // 204 无响应体，对齐 delete 类接口的守卫。
  if (res.status === 204) return
  await unwrap(res)
}

// ---------------------------------------------------------------------------
// 每日状态
// ---------------------------------------------------------------------------

export async function listHabitDaily(date: string): Promise<HabitDailyEntry[]> {
  const res = await api.get(apiUrl('habit-daily'), { searchParams: { date } })
  return unwrap<HabitDailyEntry[]>(res)
}

export async function setHabitDaily(input: SetDailyInput): Promise<HabitDailyEntry> {
  const { habitId, date, ...body } = input
  const res = await api.put(apiUrl(`habits/${habitId}/daily/${date}`), { json: body })
  return unwrap<HabitDailyEntry>(res)
}

export async function clearHabitDaily(habitId: string, date: string): Promise<void> {
  const res = await api.delete(apiUrl(`habits/${habitId}/daily/${date}`))
  if (res.status === 204) return
  await unwrap(res)
}

// ---------------------------------------------------------------------------
// 总览
// ---------------------------------------------------------------------------

export async function getHabitOverview(days: number): Promise<HabitOverview> {
  const res = await api.get(apiUrl('habit-daily/overview'), {
    searchParams: { days: String(days) },
  })
  return unwrap<HabitOverview>(res)
}
