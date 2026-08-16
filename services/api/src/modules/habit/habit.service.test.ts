import { describe, expect, test } from 'bun:test'
import type { DailyLike, DailyRowLike, HabitLike } from '@/modules/habit/habit.domain'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Habit module unit tests — pure functions (habit.domain), mappers and Zod
// schemas only. No database needed.
// ---------------------------------------------------------------------------

describe('DailyDateSchema — YYYY-MM-DD validation', () => {
  test('accepts valid dates, rejects bad formats', async () => {
    setTestEnv()
    const { DailyDateSchema } = await import('./habit.types')

    expect(DailyDateSchema.parse('2026-08-16')).toBe('2026-08-16')
    expect(() => DailyDateSchema.parse('2026/08/16')).toThrow()
    expect(() => DailyDateSchema.parse('2026-8-16')).toThrow()
    expect(() => DailyDateSchema.parse('2026-02-30')).toThrow() // invalid calendar day
    expect(() => DailyDateSchema.parse('2026-13-01')).toThrow()
  })
})

describe('habit zod schemas', () => {
  test('CreateHabitSchema accepts valid payload and defaults countable to false', async () => {
    setTestEnv()
    const { CreateHabitSchema } = await import('./habit.types')

    expect(CreateHabitSchema.safeParse({ name: '跑步', kind: 'good' }).success).toBe(true)
    const parsed = CreateHabitSchema.parse({ name: '跑步', kind: 'good' })
    expect(parsed.countable).toBe(false)

    const countable = CreateHabitSchema.parse({ name: '喝水', kind: 'good', countable: true })
    expect(countable.countable).toBe(true)
  })

  test('CreateHabitSchema rejects bad kind and whitespace-only name', async () => {
    setTestEnv()
    const { CreateHabitSchema } = await import('./habit.types')

    expect(CreateHabitSchema.safeParse({ name: '跑步', kind: 'neutral' }).success).toBe(false)
    expect(CreateHabitSchema.safeParse({ name: '   ', kind: 'good' }).success).toBe(false)
    expect(CreateHabitSchema.safeParse({ name: 'x'.repeat(101), kind: 'good' }).success).toBe(false)
    expect(CreateHabitSchema.safeParse({ name: 'x'.repeat(100), kind: 'bad' }).success).toBe(true)
  })

  test('UpdateHabitSchema requires at least one field', async () => {
    setTestEnv()
    const { UpdateHabitSchema } = await import('./habit.types')

    expect(UpdateHabitSchema.safeParse({}).success).toBe(false)
    expect(UpdateHabitSchema.safeParse({ name: '新名字' }).success).toBe(true)
    expect(UpdateHabitSchema.safeParse({ sortOrder: 5 }).success).toBe(true)
    expect(UpdateHabitSchema.safeParse({ countable: true }).success).toBe(true)
  })

  test('description semantics — create/update normalize "" to null, absent keeps', async () => {
    setTestEnv()
    const { CreateHabitSchema, UpdateHabitSchema } = await import('./habit.types')

    // create: omitted → undefined; empty string → null; valid string passes (trimmed)
    expect(CreateHabitSchema.parse({ name: '跑步', kind: 'good' }).description).toBeUndefined()
    expect(
      CreateHabitSchema.parse({ name: '跑步', kind: 'good', description: '' }).description,
    ).toBe(null)
    expect(
      CreateHabitSchema.parse({ name: '跑步', kind: 'good', description: '  晨跑 5km  ' })
        .description,
    ).toBe('晨跑 5km')
    expect(
      CreateHabitSchema.safeParse({
        name: '跑步',
        kind: 'good',
        description: 'x'.repeat(501),
      }).success,
    ).toBe(false)

    // update: absent → undefined (kept); "" → null; null → null (explicit clear)
    expect(UpdateHabitSchema.parse({ description: '' }).description).toBeNull()
    expect(UpdateHabitSchema.parse({ description: null }).description).toBeNull()
    expect(UpdateHabitSchema.parse({ description: '5km' }).description).toBe('5km')
    // description alone satisfies the "at least one field" refine
    expect(UpdateHabitSchema.safeParse({ description: '备注' }).success).toBe(true)
  })

  test('SetDailySchema rejects empty payload and negative count', async () => {
    setTestEnv()
    const { SetDailySchema } = await import('./habit.types')

    expect(SetDailySchema.safeParse({}).success).toBe(false)
    expect(SetDailySchema.safeParse({ count: -1 }).success).toBe(false)
    expect(SetDailySchema.safeParse({ status: 'done', count: 3 }).success).toBe(true)
    expect(SetDailySchema.safeParse({ status: null }).success).toBe(true)
  })
})

describe('habit date helpers', () => {
  test('formatLocalDate uses local timezone', async () => {
    setTestEnv()
    const { formatLocalDate } = await import('./habit.domain')

    expect(formatLocalDate(new Date(2026, 7, 16, 23, 30))).toBe('2026-08-16')
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  test('addDays crosses month/year boundaries', async () => {
    setTestEnv()
    const { addDays, windowStart } = await import('./habit.domain')

    expect(addDays('2026-08-16', 1)).toBe('2026-08-17')
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(windowStart('2026-08-16', 7)).toBe('2026-08-10') // 7-day window is inclusive
    expect(windowStart('2026-08-16', 1)).toBe('2026-08-16')
  })
})

describe('resolveDailyWrite — mode-aware daily write resolution', () => {
  test('non-countable habit accepts status and keeps count at 0', async () => {
    setTestEnv()
    const { resolveDailyWrite } = await import('./habit.domain')

    expect(resolveDailyWrite(null, { status: 'done' }, false)).toEqual({
      status: 'done',
      count: 0,
    })
    expect(resolveDailyWrite(null, { status: 'not_done' }, false)).toEqual({
      status: 'not_done',
      count: 0,
    })
    // status null clears back to not-recorded
    expect(resolveDailyWrite({ status: 'done', count: 0 }, { status: null }, false)).toEqual({
      status: null,
      count: 0,
    })
  })

  test('countable habit accepts count and keeps status null', async () => {
    setTestEnv()
    const { resolveDailyWrite } = await import('./habit.domain')

    expect(resolveDailyWrite(null, { count: 3 }, true)).toEqual({
      status: null,
      count: 3,
    })
    // count 0 means "not recorded today"
    expect(resolveDailyWrite({ status: null, count: 3 }, { count: 0 }, true)).toEqual({
      status: null,
      count: 0,
    })
  })

  test('rejects status on countable habits and count on non-countable habits', async () => {
    setTestEnv()
    const { resolveDailyWrite } = await import('./habit.domain')

    expect(() => resolveDailyWrite(null, { status: 'done' }, true)).toThrow(/计数型习惯/)
    expect(() => resolveDailyWrite(null, { count: 2 }, false)).toThrow(/做没做型/)
  })

  test('absent status/count keep current values on update rows', async () => {
    setTestEnv()
    const { resolveDailyWrite } = await import('./habit.domain')

    const current: DailyRowLike = { status: 'done', count: 0 }
    expect(resolveDailyWrite(current, { status: 'not_done' }, false)).toEqual({
      status: 'not_done',
      count: 0,
    })
    const c2: DailyRowLike = { status: null, count: 4 }
    expect(resolveDailyWrite(c2, { count: 5 }, true)).toEqual({
      status: null,
      count: 5,
    })
  })
})

describe('buildOverview — aggregation', () => {
  const habits: HabitLike[] = [
    { id: 'h1', name: '跑步', kind: 'good', countable: false, sortOrder: 0 },
    { id: 'h2', name: '熬夜', kind: 'bad', countable: false, sortOrder: 1 },
    { id: 'h3', name: '喝水', kind: 'good', countable: true, sortOrder: 2 },
  ]

  test('groups byDate with habit info ordered by sortOrder', async () => {
    setTestEnv()
    const { buildOverview } = await import('./habit.domain')

    const dailies: DailyLike[] = [
      { habitId: 'h3', date: '2026-08-16', status: null, count: 3 },
      { habitId: 'h1', date: '2026-08-16', status: 'done', count: 0 },
      { habitId: 'h2', date: '2026-08-15', status: 'not_done', count: 0 },
    ]
    const body = buildOverview(habits, dailies, {
      days: 30,
      fromDate: '2026-07-18',
      toDate: '2026-08-16',
    })

    expect(body.byDate['2026-08-16']).toEqual([
      {
        habitId: 'h1',
        name: '跑步',
        kind: 'good',
        countable: false,
        status: 'done',
        count: 0,
      },
      {
        habitId: 'h3',
        name: '喝水',
        kind: 'good',
        countable: true,
        status: null,
        count: 3,
      },
    ])
    expect(body.byDate['2026-08-15']).toHaveLength(1)
    expect(body.byDate['2026-08-15'][0].habitId).toBe('h2')
    // dates with no records are absent
    expect(body.byDate['2026-08-14']).toBeUndefined()
  })

  test('stats compute doneDays/notDoneDays/totalCount per mode', async () => {
    setTestEnv()
    const { buildOverview } = await import('./habit.domain')

    const dailies: DailyLike[] = [
      { habitId: 'h1', date: '2026-08-14', status: 'done', count: 0 },
      { habitId: 'h1', date: '2026-08-15', status: 'done', count: 0 },
      { habitId: 'h1', date: '2026-08-16', status: 'not_done', count: 0 },
      { habitId: 'h2', date: '2026-08-16', status: 'not_done', count: 0 },
      { habitId: 'h3', date: '2026-08-15', status: null, count: 4 },
      { habitId: 'h3', date: '2026-08-16', status: null, count: 2 },
    ]
    const body = buildOverview(habits, dailies, {
      days: 30,
      fromDate: '2026-07-18',
      toDate: '2026-08-16',
    })

    const byId = Object.fromEntries(body.stats.map((s) => [s.habitId, s]))
    expect(byId.h1).toMatchObject({ doneDays: 2, notDoneDays: 1, totalCount: 0 })
    expect(byId.h2).toMatchObject({ doneDays: 0, notDoneDays: 1, totalCount: 0 })
    expect(byId.h3).toMatchObject({ doneDays: 2, notDoneDays: 0, totalCount: 6 })
    // stats order follows habit order
    expect(body.stats.map((s) => s.habitId)).toEqual(['h1', 'h2', 'h3'])
  })

  test('stats include zero rows for habits without any record', async () => {
    setTestEnv()
    const { buildOverview } = await import('./habit.domain')

    const body = buildOverview(habits, [], {
      days: 30,
      fromDate: '2026-07-18',
      toDate: '2026-08-16',
    })
    expect(body.byDate).toEqual({})
    expect(body.stats).toHaveLength(3)
    expect(
      body.stats.every((s) => s.doneDays === 0 && s.notDoneDays === 0 && s.totalCount === 0),
    ).toBe(true)
  })
})

describe('habit mappers', () => {
  test('toHabitEntry converts a row to an entry with ISO timestamps', async () => {
    setTestEnv()
    const { toHabitEntry } = await import('./habit.mappers')

    expect(
      toHabitEntry({
        id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f6001',
        name: '跑步',
        description: '晨跑 5km',
        kind: 'good',
        countable: false,
        sortOrder: 0,
        createdAt: new Date('2026-08-05T12:00:00.000Z'),
        updatedAt: new Date('2026-08-05T12:00:00.000Z'),
      }),
    ).toEqual({
      id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f6001',
      name: '跑步',
      description: '晨跑 5km',
      kind: 'good',
      countable: false,
      sortOrder: 0,
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
    })
  })

  test('toDailyEntry converts a row to the compact daily entry shape', async () => {
    setTestEnv()
    const { toDailyEntry } = await import('./habit.mappers')

    expect(
      toDailyEntry({
        id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f6002',
        habitId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f6001',
        date: '2026-08-16',
        status: 'done',
        count: 0,
        createdAt: new Date('2026-08-05T12:00:00.000Z'),
        updatedAt: new Date('2026-08-05T12:00:00.000Z'),
      }),
    ).toEqual({
      habitId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f6001',
      status: 'done',
      count: 0,
    })
  })
})
