import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { RUN_DB_TESTS, setTestEnv, uniqueTitle } from '@/test/helpers'

// ---------------------------------------------------------------------------
// L3 动态快照集成测试 — 真实 PostgreSQL：createDefaultSources() 走真实
// service 查询，验证「造数据 → 快照包含对应段」与指纹缓存去重。
//
// GATED: RUN_DB_TESTS=1（与其它模块集成测试一致）：
//
//   cd services/api && DATABASE_URL=postgresql://serenique:serenique@127.0.0.1:5433/serenique \
//     RUN_DB_TESTS=1 bun test src/modules/ai/ai.context-snapshot.integration.test.ts
//
// 清理：创建的任务/事件/闪念/习惯在 afterAll 删除（run token 前缀定位）。
// ---------------------------------------------------------------------------

setTestEnv()

describe.skipIf(!RUN_DB_TESTS)('ai.context-snapshot DB integration', () => {
  let buildDynamicSnapshot: typeof import('./ai.context-snapshot').buildDynamicSnapshot
  let createDefaultSources: typeof import('./ai.context-snapshot').createDefaultSources
  let formatLocalDate: typeof import('./ai.context-snapshot').formatLocalDate
  let taskService: typeof import('@/modules/task/task.service').taskService
  let eventService: typeof import('@/modules/event/event.service').eventService
  let momentService: typeof import('@/modules/moment/moment.service').momentService
  let habitService: typeof import('@/modules/habit/habit.service').habitService

  const createdTaskIds: string[] = []
  const createdEventIds: string[] = []
  const createdMomentIds: string[] = []
  const createdHabitIds: string[] = []
  let createdGroupId: string | undefined
  let now: Date

  beforeAll(async () => {
    setTestEnv()
    ;({ buildDynamicSnapshot, createDefaultSources } = await import('./ai.context-snapshot'))
    formatLocalDate = (await import('./ai.context-snapshot')).formatLocalDate
    taskService = (await import('@/modules/task/task.service')).taskService
    eventService = (await import('@/modules/event/event.service')).eventService
    momentService = (await import('@/modules/moment/moment.service')).momentService
    habitService = (await import('@/modules/habit/habit.service')).habitService
    now = new Date()

    // 造一批 run-token 前缀数据，供快照断言。
    const group = await taskService.createTaskGroup({ title: uniqueTitle('snap-组') })
    createdGroupId = group.id
    const task = await taskService.createTask({
      groupId: group.id,
      title: uniqueTitle('snap-任务'),
      status: 'todo',
    })
    createdTaskIds.push(task.id)
    const startAt = new Date(Date.now() + 60 * 60 * 1000)
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000)
    const evt = await eventService.create({
      title: uniqueTitle('snap-日程'),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    })
    createdEventIds.push(evt.id)
    const moment = await momentService.create({ text: uniqueTitle('snap-闪念') })
    createdMomentIds.push(moment.id)
    const habit = await habitService.createHabit({ name: uniqueTitle('snap-习惯'), kind: 'good' })
    createdHabitIds.push(habit.id)
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS) return
    for (const id of createdTaskIds) await taskService.deleteTask({ id }).catch(() => {})
    for (const id of createdEventIds) await eventService.delete({ id }).catch(() => {})
    for (const id of createdMomentIds) await momentService.delete({ id }).catch(() => {})
    for (const id of createdHabitIds) await habitService.deleteHabit({ id }).catch(() => {})
    if (createdGroupId) await taskService.deleteTaskGroup({ id: createdGroupId }).catch(() => {})
  })

  test('真实数据源：快照包含任务/任务组/日程/闪念/习惯段', async () => {
    const text = await buildDynamicSnapshot(now, createDefaultSources(now), new Map())
    expect(text).toContain('[当前时间]')
    const token = uniqueTitle('snap-任务').slice(4, 20) // 与 setUp 前缀一致
    expect(text).toContain('[任务概览]')
    expect(text).toContain(token)
    expect(text).toContain('[最新闪念]')
    expect(text).toContain('[最近习惯]')
  }, 15000)

  test('指纹缓存：连续 build 第二次不重复执行（load 复用）', async () => {
    const sources = createDefaultSources(now)
    const cache = new Map()
    const first = await buildDynamicSnapshot(now, sources, cache)
    expect(first).toContain('[当前时间]')
    // 第二个独立 cache → 重新 load；同一 cache → 指纹命中复用。
    const secondFresh = await buildDynamicSnapshot(now, sources, new Map())
    expect(secondFresh).toBe(first)
    const secondCached = await buildDynamicSnapshot(now, sources, cache)
    expect(secondCached).toBe(first)
  }, 15000)

  test('habit_daily 打卡后习惯段指纹失效、概览刷新（只写 daily 不动 habits）', async () => {
    const date = formatLocalDate(now)
    const habitId = createdHabitIds[0]
    const sources = createDefaultSources(now)
    const cache = new Map()

    // 首次快照：该习惯无每日记录 → 习惯段不出现打卡天数。
    const before = await buildDynamicSnapshot(now, sources, cache)
    expect(before).toContain('[最近习惯]')
    expect(before).not.toContain('打卡 1 天')

    // 只打卡（setDaily 仅写 habit_daily，不碰 habits.updatedAt）。
    await habitService.setDaily({ habitId, date, status: 'done' })
    try {
      const after = await buildDynamicSnapshot(now, sources, cache)
      expect(after).not.toBe(before) // habit_daily 参与指纹 → 必须失效重载
      expect(after).toContain('打卡 1 天') // 概览已刷新含当日打卡
    } finally {
      await habitService.clearDaily({ habitId, date }).catch(() => {})
    }
  }, 15000)
})
