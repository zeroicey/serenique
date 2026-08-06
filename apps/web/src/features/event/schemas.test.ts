import { describe, expect, it } from 'vitest'
import { eventFormSchema } from './schemas'

const valid = {
  title: '晨会',
  startAt: '2026-08-06T09:00',
  endAt: '2026-08-06T10:00',
  isAllDay: false,
}

describe('eventFormSchema', () => {
  it('空标题校验失败', () => {
    expect(eventFormSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false)
  })

  it('超长标题校验失败', () => {
    expect(eventFormSchema.safeParse({ ...valid, title: '长'.repeat(201) }).success).toBe(false)
  })

  it('空开始/结束时间校验失败', () => {
    expect(eventFormSchema.safeParse({ ...valid, startAt: '' }).success).toBe(false)
    expect(eventFormSchema.safeParse({ ...valid, endAt: '' }).success).toBe(false)
  })

  it('结束时间早于开始时间校验失败', () => {
    const r = eventFormSchema.safeParse({
      ...valid,
      startAt: '2026-08-06T10:00',
      endAt: '2026-08-06T09:00',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === '结束时间必须晚于开始时间')).toBe(true)
    }
  })

  it('结束时间等于开始时间校验失败', () => {
    expect(
      eventFormSchema.safeParse({
        ...valid,
        startAt: '2026-08-06T10:00',
        endAt: '2026-08-06T10:00',
      }).success,
    ).toBe(false)
  })

  it('合法值通过（optional 字段省略）', () => {
    const r = eventFormSchema.safeParse(valid)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.title).toBe('晨会')
      expect(r.data.location).toBeUndefined()
      expect(r.data.isAllDay).toBe(false)
    }
  })

  it('location/note 传空串仍通过（后端按空串清空）', () => {
    const r = eventFormSchema.safeParse({ ...valid, location: '', note: '' })
    expect(r.success).toBe(true)
  })
})
