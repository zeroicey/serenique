import { describe, expect, it } from 'vitest'
import { taskFormSchema, taskGroupFormSchema } from './schemas'

describe('taskGroupFormSchema', () => {
  it('空标题校验失败', () => {
    expect(taskGroupFormSchema.safeParse({ title: '   ' }).success).toBe(false)
  })

  it('超长标题校验失败', () => {
    expect(taskGroupFormSchema.safeParse({ title: '长'.repeat(201) }).success).toBe(false)
  })

  it('合法标题通过', () => {
    expect(taskGroupFormSchema.safeParse({ title: ' 工作 ' }).success).toBe(true)
  })
})

describe('taskFormSchema', () => {
  it('空内容校验失败', () => {
    expect(taskFormSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('合法内容通过', () => {
    const r = taskFormSchema.safeParse({ title: '  写周报  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.title).toBe('写周报')
  })
})
