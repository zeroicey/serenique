import { describe, expect, it } from 'vitest'
import type { EventEntry } from './api'
import {
  dayWindow,
  eventTimeLabel,
  shiftDate,
  sortEvents,
  toLocalInputValue,
  toLocalISO,
} from './lib'

// 用 new Date(y, m-1, d, hh, mi) 构造本地时间，断言均基于本地时区。
const HOUR_MS = 3_600_000

describe('shiftDate', () => {
  it('前后一天（含跨月/跨年）', () => {
    expect(shiftDate('2026-08-06', 1)).toBe('2026-08-07')
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('dayWindow', () => {
  it('返回本地当日 [00:00, 次日00:00) 窗口', () => {
    const { from, to } = dayWindow('2026-08-06')
    const fromD = new Date(from)
    const toD = new Date(to)
    expect(fromD.getDate()).toBe(6)
    expect(fromD.getHours()).toBe(0)
    expect(toD.getDate()).toBe(7)
    expect(toD.getHours()).toBe(0)
    expect(toD.getTime() - fromD.getTime()).toBe(24 * HOUR_MS)
  })
})

describe('toLocalISO', () => {
  it('把 datetime-local 字符串按本地解释转 ISO', () => {
    const result = toLocalISO('2026-08-06T09:00')
    const d = new Date(result)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(6)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(0)
  })
})

describe('toLocalInputValue', () => {
  it('把 ISO 转成本地 YYYY-MM-DDTHH:mm', () => {
    expect(toLocalInputValue(new Date(2026, 7, 6, 9, 5).toISOString())).toBe('2026-08-06T09:05')
  })
})

describe('eventTimeLabel', () => {
  it('全天事件显示「全天」', () => {
    expect(
      eventTimeLabel({ isAllDay: true, startAt: 'x', endAt: 'y' }),
    ).toBe('全天')
  })

  it('时段事件显示本地 HH:mm – HH:mm', () => {
    const startAt = new Date(2026, 7, 6, 9, 0).toISOString()
    const endAt = new Date(2026, 7, 6, 10, 30).toISOString()
    expect(eventTimeLabel({ isAllDay: false, startAt, endAt })).toBe('09:00 – 10:30')
  })
})

describe('sortEvents', () => {
  it('按 startAt 升序排列', () => {
    const a = { startAt: '2026-08-06T03:00:00.000Z' }
    const b = { startAt: '2026-08-06T01:00:00.000Z' }
    const c = { startAt: '2026-08-06T02:00:00.000Z' }
    const list = [a, b, c] as EventEntry[]
    expect(list.sort(sortEvents).map((e) => e.startAt)).toEqual([
      '2026-08-06T01:00:00.000Z',
      '2026-08-06T02:00:00.000Z',
      '2026-08-06T03:00:00.000Z',
    ])
  })
})
