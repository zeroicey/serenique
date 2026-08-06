import { formatTime } from '@/lib/format'
import type { EventEntry } from './api'

// 事件 feature 纯函数：时间窗口 / 时区转换 / 展示标签 / 排序。无 DB、无 IO，毫秒级单测。

/** YYYY-MM-DD（本地）→ 当日窗口 [00:00, 次日00:00) 的 ISO（Z，后端 z.iso.datetime 接受）。 */
export function dayWindow(date: string): { from: string; to: string } {
  const [y, m, d] = date.split('-').map(Number)
  return {
    from: new Date(y, m - 1, d, 0, 0, 0).toISOString(),
    to: new Date(y, m - 1, d + 1, 0, 0, 0).toISOString(),
  }
}

/** datetime-local 字符串（YYYY-MM-DDTHH:mm，无偏移，按本地解释）→ ISO。 */
export function toLocalISO(inputValue: string): string {
  return new Date(inputValue).toISOString()
}

/** ISO → datetime-local 字符串（本地时区，编辑回填）。 */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}T${hh}:${mi}`
}

/** 事件时间标签：全天 → '全天'；时段 → 'HH:mm – HH:mm'（本地时区）。 */
export function eventTimeLabel(
  event: Pick<EventEntry, 'isAllDay' | 'startAt' | 'endAt'>,
): string {
  if (event.isAllDay) return '全天'
  return `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`
}

/** startAt 升序（前端兜底，对齐 API 排序）。 */
export function sortEvents(a: EventEntry, b: EventEntry): number {
  return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
}
