import { describe, expect, it } from 'vitest'
import { habitFormSchema } from './schemas'

describe('habitFormSchema', () => {
  it('空名称校验失败', () => {
    expect(
      habitFormSchema.safeParse({ name: '   ', kind: 'good', countable: false, sortOrder: '' })
        .success,
    ).toBe(false)
  })

  it('超长名称校验失败', () => {
    expect(
      habitFormSchema.safeParse({
        name: '长'.repeat(101),
        kind: 'good',
        countable: false,
        sortOrder: '',
      }).success,
    ).toBe(false)
  })

  it('非法排序号校验失败', () => {
    expect(
      habitFormSchema.safeParse({ name: '跑步', kind: 'good', countable: false, sortOrder: 'abc' })
        .success,
    ).toBe(false)
    expect(
      habitFormSchema.safeParse({ name: '跑步', kind: 'good', countable: false, sortOrder: '-1' })
        .success,
    ).toBe(false)
  })

  it('合法输入通过并 trim 名称', () => {
    const r = habitFormSchema.safeParse({
      name: ' 跑步 ',
      kind: 'bad',
      countable: true,
      sortOrder: '2',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('跑步')
      expect(r.data.kind).toBe('bad')
      expect(r.data.countable).toBe(true)
      expect(r.data.sortOrder).toBe('2')
    }
  })

  it('空排序号通过（默认 0）', () => {
    const r = habitFormSchema.safeParse({
      name: '跑步',
      kind: 'good',
      countable: false,
      sortOrder: '',
    })
    expect(r.success).toBe(true)
  })
})
