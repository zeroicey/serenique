import { describe, expect, it } from 'vitest'
import { todayLocal } from '@/lib/date'
import { diaryFormSchema } from './schemas'

describe('diaryFormSchema', () => {
  it('空内容校验失败', () => {
    const r = diaryFormSchema.safeParse({ content: '   ', diaryDate: todayLocal() })
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

  it('本地今天可以通过（允许补写今天）', () => {
    const r = diaryFormSchema.safeParse({ content: '今天很开心', diaryDate: todayLocal() })
    expect(r.success).toBe(true)
  })
})
