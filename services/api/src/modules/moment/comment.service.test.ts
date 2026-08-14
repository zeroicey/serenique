import { describe, expect, test } from 'bun:test'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Moment comment unit tests — Zod schemas and mappers. No DB.
// ---------------------------------------------------------------------------

describe('moment comment schemas', () => {
  test('CreateMomentCommentSchema requires content of 1..2000 chars', async () => {
    setTestEnv()
    const { CreateMomentCommentSchema } = await import('./comment.types')

    expect(CreateMomentCommentSchema.safeParse({ content: '回看备注' }).success).toBe(true)
    expect(CreateMomentCommentSchema.safeParse({ content: 'x'.repeat(2000) }).success).toBe(true)
    expect(CreateMomentCommentSchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false)
    expect(CreateMomentCommentSchema.safeParse({ content: '' }).success).toBe(false)
    expect(CreateMomentCommentSchema.safeParse({}).success).toBe(false)
  })

  test('UpdateMomentCommentSchema requires content of 1..2000 chars', async () => {
    setTestEnv()
    const { UpdateMomentCommentSchema } = await import('./comment.types')

    expect(UpdateMomentCommentSchema.safeParse({ content: '修改后的备注' }).success).toBe(true)
    expect(UpdateMomentCommentSchema.safeParse({}).success).toBe(false)
    expect(UpdateMomentCommentSchema.safeParse({ content: '' }).success).toBe(false)
  })
})

describe('moment comment mappers', () => {
  test('toMomentCommentEntry exposes momentId and ISO timestamps', async () => {
    setTestEnv()
    const { toMomentCommentEntry } = await import('./comment.mappers')

    const entry = toMomentCommentEntry({
      id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f5001',
      momentId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001',
      content: '一条回看备注',
      createdAt: new Date('2026-08-05T12:00:00.000Z'),
      updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    })

    expect(entry.id).toBe('0198f6d0-9e7c-71d7-8214-2a0f7f5f5001')
    expect(entry.momentId).toBe('0198f6d0-9e7c-71d7-8214-2a0f7f5f1001')
    expect(entry.content).toBe('一条回看备注')
    expect(entry.createdAt).toBe('2026-08-05T12:00:00.000Z')
    expect(entry.updatedAt).toBe('2026-08-05T12:00:00.000Z')
  })

  test('groupCommentsByMomentId groups by momentId preserving order', async () => {
    setTestEnv()
    const { groupCommentsByMomentId } = await import('./comment.mappers')

    const m1 = '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001'
    const m2 = '0198f6d0-9e7c-71d7-8214-2a0f7f5f1002'
    const entry = (momentId: string, id: string) => ({
      id,
      momentId,
      content: '备注',
      createdAt: '2026-08-05T10:00:00.000Z',
      updatedAt: '2026-08-05T10:00:00.000Z',
    })

    const grouped = groupCommentsByMomentId([entry(m1, 'c1'), entry(m2, 'c2'), entry(m1, 'c3')])

    expect([...grouped.keys()].sort()).toEqual([m1, m2])
    expect(grouped.get(m1)!.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(grouped.get(m2)!.map((c) => c.id)).toEqual(['c2'])
  })
})
