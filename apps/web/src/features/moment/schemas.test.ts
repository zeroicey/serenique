import { describe, expect, it } from 'vitest'
import { momentCreateSchema } from './schemas'

describe('momentCreateSchema', () => {
  it('空文本校验失败', () => {
    const r = momentCreateSchema.safeParse({ text: '   ' })
    expect(r.success).toBe(false)
  })

  it('超过 10000 字校验失败', () => {
    const r = momentCreateSchema.safeParse({ text: 'a'.repeat(10001) })
    expect(r.success).toBe(false)
  })

  it('合法文本通过', () => {
    const r = momentCreateSchema.safeParse({ text: '今天很开心' })
    expect(r.success).toBe(true)
  })
})
