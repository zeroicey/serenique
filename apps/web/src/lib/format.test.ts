import { describe, expect, it } from 'vitest'
import { formatDate, formatTime } from './format'

describe('formatDate', () => {
  it('格式化为 MM-DD HH:mm', () => {
    expect(formatDate('2026-08-05T09:07:00.000Z')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})

describe('formatTime', () => {
  it('格式化为本地 HH:mm', () => {
    // new Date(y, m-1, d, hh, mi) 构造本地时间，toISOString 转 UTC。
    expect(formatTime(new Date(2026, 7, 6, 9, 5).toISOString())).toBe('09:05')
    expect(formatTime(new Date(2026, 7, 6, 23, 59).toISOString())).toBe('23:59')
  })
})
