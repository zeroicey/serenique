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

  it('location 合法对象通过', () => {
    const r = momentCreateSchema.safeParse({
      text: 'x',
      location: { name: '三里屯', latitude: 39.9, longitude: 116.4 },
    })
    expect(r.success).toBe(true)
  })

  it('location 为 null 或缺省通过', () => {
    expect(momentCreateSchema.safeParse({ text: 'x', location: null }).success).toBe(true)
    expect(momentCreateSchema.safeParse({ text: 'x' }).success).toBe(true)
  })

  it('location 空对象校验失败', () => {
    const r = momentCreateSchema.safeParse({ text: 'x', location: {} })
    expect(r.success).toBe(false)
  })

  it('location 坐标越界校验失败', () => {
    expect(momentCreateSchema.safeParse({ text: 'x', location: { latitude: 91 } }).success).toBe(
      false,
    )
    expect(
      momentCreateSchema.safeParse({ text: 'x', location: { longitude: -181 } }).success,
    ).toBe(false)
  })

  it('location name 超长校验失败', () => {
    const r = momentCreateSchema.safeParse({ text: 'x', location: { name: '长'.repeat(129) } })
    expect(r.success).toBe(false)
  })
})
