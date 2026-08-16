import type { HabitDailyEntry, HabitEntry, OverviewRecord, OverviewStat } from './api'

// 习惯 feature 纯函数：日期偏移 / 排序 / 每日状态聚合 / 总览展示转换。无 DB、无 IO，毫秒级单测。

/** 日期（YYYY-MM-DD）± N 天（本地），返回 YYYY-MM-DD。正午构造避免夏令时边界抖动。 */
export function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(y, m - 1, d + delta, 12, 0, 0)
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${next.getFullYear()}-${mm}-${dd}`
}

/** 习惯列表排序：sortOrder asc，同序按 createdAt asc（对齐 API 契约）。 */
export function sortHabits(a: HabitEntry, b: HabitEntry): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

/** 每日状态列表 → habitId → 记录的 Map（今天页习惯行按 id 取当天状态）。 */
export function dailyByHabit(daily: HabitDailyEntry[]): Map<string, HabitDailyEntry> {
  return new Map(daily.map((d) => [d.habitId, d]))
}

/** 总览 byDate（date → 记录数组）→ 按日期倒序的列表，供流水渲染。 */
export function overviewDayList(byDate: Record<string, OverviewRecord[]>): {
  date: string
  records: OverviewRecord[]
}[] {
  return Object.entries(byDate)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, records]) => ({ date, records }))
}

/** 总览统计按 sortOrder 保持习惯列表顺序（stats 自身无 sortOrder，用名字兜底稳定排序）。 */
export function sortStats(stats: OverviewStat[], habitOrder: Map<string, number>): OverviewStat[] {
  return [...stats].sort((a, b) => {
    const oa = habitOrder.get(a.habitId) ?? Number.MAX_SAFE_INTEGER
    const ob = habitOrder.get(b.habitId) ?? Number.MAX_SAFE_INTEGER
    if (oa !== ob) return oa - ob
    return a.name.localeCompare(b.name, 'zh')
  })
}

/** YYYY-MM-DD → 「周六」样式的星期标签。 */
export function weekdayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d, 12, 0, 0).getDay()
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day]
}

/** YYYY-MM-DD → 「08-16」样式（总览流水日期分组标题用）。 */
export function monthDayLabel(date: string): string {
  return date.slice(5)
}

/** 统计展示文本：做没做型 → 「N/M 天」；计数型 → 「共 N 次」。 */
export function statText(stat: OverviewStat, days: number): string {
  if (stat.countable) return `共 ${stat.totalCount} 次`
  return `${stat.doneDays}/${days} 天`
}
