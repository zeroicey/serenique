import { describe, expect, it } from 'vitest'
import { todayUTC } from '@/lib/date'
import { diaryFormSchema } from './schemas'

describe('diaryFormSchema', () => {
  it('空内容校验失败', () => {
    const r = diaryFormSchema.safeParse({ content: '   ', diaryDate: todayUTC() })
    expect(r.success).toBe(false)
  })

  it('非法日期格式校验失败', () => {
    const r = diaryFormSchema.safeParse({ content: '今天', diaryDate: '2026/08/05' })
    expect(r.success).toBe(false)
  })

  it('未来日期被拦截', () => {
    const r = diaryFormSchema.safeParse({ content: '今天', diaryDate: '2999-12-31' })
    expect(r.success).toBe(false)
  })

  it('合法输入通过', () => {
    const r = diaryFormSchema.safeParse({ content: '今天很开心', diaryDate: todayUTC() })
    expect(r.success).toBe(true)
  })
})
