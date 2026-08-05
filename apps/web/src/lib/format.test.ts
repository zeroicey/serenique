import { describe, expect, it } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('格式化为 MM-DD HH:mm', () => {
    expect(formatDate('2026-08-05T09:07:00.000Z')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
