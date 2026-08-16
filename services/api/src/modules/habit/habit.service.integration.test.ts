import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import { RUN_DB_TESTS, setTestEnv, uniqueTitle } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Habit service integration tests — exercise the real service + Drizzle ORM
// against PostgreSQL (docker compose test DB).
//
// GATED: the whole suite is skipped unless RUN_DB_TESTS=1 is set, so plain
// `bun test` stays green when the database is not running.
//
// Cleanup: every habit created here is tracked and deleted in afterAll
// (deleting a habit cascades to its daily rows at the DB level).
// ---------------------------------------------------------------------------

setTestEnv()

const createdHabitIds: string[] = []

describe.skipIf(!RUN_DB_TESTS)('habit service DB integration', () => {
  let service: typeof import('./habit.service').habitService
  let habitDailyTable: typeof import('./habit.schema').habitDaily
  let habitsTable: typeof import('./habit.schema').habits

  beforeAll(async () => {
    setTestEnv()
    service = (await import('./habit.service')).habitService
    habitDailyTable = (await import('./habit.schema')).habitDaily
    habitsTable = (await import('./habit.schema')).habits
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdHabitIds.length === 0) return
    // Deleting a habit cascades to its daily rows (ON DELETE CASCADE).
    await (await import('@/db/connection')).db
      .delete(habitsTable)
      .where(inArray(habitsTable.id, createdHabitIds))
  })

  // ---- Habit option CRUD ---------------------------------------------------

  test('habit create / get-via-list / update / delete', async () => {
    const created = await service.createHabit({
      name: uniqueTitle('习惯-crud'),
      kind: 'good',
      description: '晨跑 5km',
    })
    createdHabitIds.push(created.id)

    expect(created.id).toBeTruthy()
    expect(created.countable).toBe(false)
    expect(created.sortOrder).toBe(0)
    expect(created.description).toBe('晨跑 5km')

    const listed = await service.listHabits()
    expect(listed.some((h) => h.id === created.id)).toBe(true)

    const renamed = await service.updateHabit({
      id: created.id,
      name: uniqueTitle('习惯-crud-改名'),
      sortOrder: 3,
    })
    expect(renamed.name).toContain('改名')
    expect(renamed.sortOrder).toBe(3)
    // 未传 description → 保持不变
    expect(renamed.description).toBe('晨跑 5km')

    // null 显式清除简介
    const cleared = await service.updateHabit({ id: created.id, description: null })
    expect(cleared.description).toBeNull()

    await service.deleteHabit({ id: created.id })
    expect((await service.listHabits()).some((h) => h.id === created.id)).toBe(false)
  })

  test('listHabits orders by sortOrder asc then createdAt asc', async () => {
    const a = await service.createHabit({ name: uniqueTitle('习惯-序'), kind: 'good' })
    const b = await service.createHabit({ name: uniqueTitle('习惯-序'), kind: 'bad' })
    createdHabitIds.push(a.id, b.id)
    // sortOrder 升序：a 保持 0 在前，b 置 1 在后（相同 sortOrder 再按 createdAt）。
    await service.updateHabit({ id: b.id, sortOrder: 1 })

    const ours = (await service.listHabits()).filter((h) => h.name.startsWith('it-习惯-序'))
    expect(ours[0].id).toBe(a.id)
    expect(ours[1].id).toBe(b.id)
  })

  test('updating / deleting a missing habit rejects with 404', async () => {
    await expect(service.updateHabit({ id: randomUUID(), name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
    await expect(service.deleteHabit({ id: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  // ---- Daily records — non-countable (status) mode -------------------------

  test('setDaily upserts status for a non-countable habit', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-状态'), kind: 'good' })
    createdHabitIds.push(habit.id)

    const done = await service.setDaily({ habitId: habit.id, date: '2026-08-16', status: 'done' })
    expect(done).toMatchObject({ habitId: habit.id, status: 'done', count: 0 })

    // same day upsert → status transitions
    const flipped = await service.setDaily({
      habitId: habit.id,
      date: '2026-08-16',
      status: 'not_done',
    })
    expect(flipped.status).toBe('not_done')

    // clear back to not-recorded via status null
    const cleared = await service.setDaily({
      habitId: habit.id,
      date: '2026-08-16',
      status: null,
    })
    expect(cleared.status).toBeNull()

    const day = await service.listDaily({ date: '2026-08-16' })
    expect(day.filter((d) => d.habitId === habit.id)).toHaveLength(1)
  })

  test('setDaily rejects count on a non-countable habit', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-禁次'), kind: 'good' })
    createdHabitIds.push(habit.id)

    await expect(
      service.setDaily({ habitId: habit.id, date: '2026-08-16', count: 2 }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  // ---- Daily records — countable mode --------------------------------------

  test('setDaily upserts count for a countable habit', async () => {
    const habit = await service.createHabit({
      name: uniqueTitle('习惯-喝水'),
      kind: 'good',
      countable: true,
    })
    createdHabitIds.push(habit.id)

    const first = await service.setDaily({ habitId: habit.id, date: '2026-08-16', count: 3 })
    expect(first).toMatchObject({ habitId: habit.id, status: null, count: 3 })

    const bumped = await service.setDaily({ habitId: habit.id, date: '2026-08-16', count: 5 })
    expect(bumped.count).toBe(5)

    const zeroed = await service.setDaily({ habitId: habit.id, date: '2026-08-16', count: 0 })
    expect(zeroed.count).toBe(0)
  })

  test('setDaily rejects status on a countable habit', async () => {
    const habit = await service.createHabit({
      name: uniqueTitle('习惯-禁态'),
      kind: 'bad',
      countable: true,
    })
    createdHabitIds.push(habit.id)

    await expect(
      service.setDaily({ habitId: habit.id, date: '2026-08-16', status: 'done' }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  test('setDaily for a missing habit rejects with 404', async () => {
    await expect(
      service.setDaily({ habitId: randomUUID(), date: '2026-08-16', status: 'done' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  test('setDaily rejects an invalid date at the service layer', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-日期'), kind: 'good' })
    createdHabitIds.push(habit.id)

    // AI 工具直连 service 会绕过 handler 的 DailyDateSchema.parse，
    // 服务层兜底必须拒绝非法日期（如 2026-02-30）。
    await expect(
      service.setDaily({ habitId: habit.id, date: '2026-02-30', status: 'done' }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  // ---- clearDaily ----------------------------------------------------------

  test('clearDaily removes the row for a date', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-清除'), kind: 'good' })
    createdHabitIds.push(habit.id)
    await service.setDaily({ habitId: habit.id, date: '2026-08-16', status: 'done' })

    const result = await service.clearDaily({ habitId: habit.id, date: '2026-08-16' })
    expect(result).toEqual({ habitId: habit.id, date: '2026-08-16' })

    expect(
      (await service.listDaily({ date: '2026-08-16' })).filter((d) => d.habitId === habit.id),
    ).toHaveLength(0)
  })

  test('clearDaily on an absent record rejects with 404', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-清除无'), kind: 'good' })
    createdHabitIds.push(habit.id)

    await expect(
      service.clearDaily({ habitId: habit.id, date: '2026-08-16' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  // ---- Cascade delete ------------------------------------------------------

  test('deleting a habit cascades to its daily rows', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-级联'), kind: 'good' })
    await service.setDaily({ habitId: habit.id, date: '2026-08-15', status: 'done' })
    await service.setDaily({ habitId: habit.id, date: '2026-08-16', status: 'not_done' })

    await service.deleteHabit({ id: habit.id })

    const remaining = await (await import('@/db/connection')).db
      .select({ id: habitDailyTable.id })
      .from(habitDailyTable)
      .where(inArray(habitDailyTable.habitId, [habit.id]))
    expect(remaining).toHaveLength(0)
  })

  // ---- Overview ------------------------------------------------------------

  test('overview groups byDate and aggregates stats within the window', async () => {
    const run = uniqueTitle('习惯-总览')
    const good = await service.createHabit({ name: `${run}-跑步`, kind: 'good' })
    const bad = await service.createHabit({ name: `${run}-熬夜`, kind: 'bad' })
    const water = await service.createHabit({
      name: `${run}-喝水`,
      kind: 'good',
      countable: true,
    })
    createdHabitIds.push(good.id, bad.id, water.id)

    // 以运行当天为锚（今天 / 昨天 / 前天），确保在 30 天窗口内且不依赖运行日期。
    const { addDays, formatLocalDate } = await import('./habit.domain')
    const today = formatLocalDate(new Date())
    const d1 = today
    const d2 = addDays(today, -1)
    const d3 = addDays(today, -2)

    await service.setDaily({ habitId: good.id, date: d3, status: 'done' })
    await service.setDaily({ habitId: good.id, date: d2, status: 'done' })
    await service.setDaily({ habitId: good.id, date: d1, status: 'not_done' })
    await service.setDaily({ habitId: bad.id, date: d1, status: 'not_done' })
    await service.setDaily({ habitId: water.id, date: d2, count: 4 })
    await service.setDaily({ habitId: water.id, date: d1, count: 2 })

    const body = await service.overview({ days: 30 })

    // days window is present and well-formed
    expect(body.days).toBe(30)
    expect(body.fromDate).toBeTruthy()
    expect(body.toDate).toBeTruthy()

    // byDate 只断言本测试的习惯（同文件其它测试也会写同日期数据，不做全量计数）
    const inDay = (date: string, ids: string[]) =>
      body.byDate[date]?.filter((d) => ids.includes(d.habitId)) ?? []
    expect(inDay(d1, [good.id, bad.id, water.id])).toHaveLength(3)
    expect(inDay(d2, [good.id, water.id])).toHaveLength(2)
    expect(inDay(d3, [good.id])).toHaveLength(1)

    const stats = Object.fromEntries(body.stats.map((s) => [s.name, s]))
    expect(stats[`${run}-跑步`]).toMatchObject({ countable: false, doneDays: 2, notDoneDays: 1 })
    expect(stats[`${run}-熬夜`]).toMatchObject({ countable: false, doneDays: 0, notDoneDays: 1 })
    expect(stats[`${run}-喝水`]).toMatchObject({ countable: true, doneDays: 2, totalCount: 6 })
  })

  test('overview respects the days window', async () => {
    const habit = await service.createHabit({ name: uniqueTitle('习惯-窗口'), kind: 'good' })
    createdHabitIds.push(habit.id)
    await service.setDaily({ habitId: habit.id, date: '2026-01-01', status: 'done' })

    const body = await service.overview({ days: 7 })
    expect(body.byDate['2026-01-01']).toBeUndefined()
    const stat = body.stats.find((s) => s.habitId === habit.id)
    expect(stat).toMatchObject({ doneDays: 0 })
  })
})
