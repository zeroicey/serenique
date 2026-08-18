import { describe, expect, test } from 'bun:test'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// L3 动态快照测试 — 纯函数（时间/各段 summarize/指纹）+ 编排（指纹缓存命中、
// 失效、单段降级）。全部用假数据源，不触碰真实 DB（import 链经 setTestEnv
// 提供 env；fake sources 完全不发查询）。
// ---------------------------------------------------------------------------

setTestEnv()

const {
  addDaysLocal,
  buildDynamicSnapshot,
  dueDateLabel,
  fingerprintOf,
  formatGmtOffset,
  formatLocalDate,
  formatSnapshotTime,
  habitsFingerprint,
  SNAPSHOT_QUOTAS,
  summarizeEvents,
  summarizeHabits,
  summarizeMoments,
  summarizeTasks,
  truncateText,
} = await import('./ai.context-snapshot')

describe('formatSnapshotTime — 时间块（每轮强制刷新）', () => {
  test('格式：日期星期时分时区', () => {
    // 用本地时区构造（测试平台无关；2026-08-19 无论时区都是星期三）。
    const now = new Date(2026, 7, 19, 22, 41)
    const text = formatSnapshotTime(now)
    expect(text).toContain('[当前时间]')
    expect(text).toMatch(/现在是 2026-08-19（星期三）\d{2}:\d{2}，时区 GMT[+-]\d+(:\d{2})?/)
  })

  test('同一时刻跨分钟也重新生成（不缓存）', () => {
    const a = formatSnapshotTime(new Date(2026, 7, 19, 22, 41))
    const b = formatSnapshotTime(new Date(2026, 7, 19, 22, 42))
    expect(a).not.toBe(b)
  })

  test('formatGmtOffset：格式为 GMT±N(:MM)', () => {
    const now = new Date(2026, 7, 19, 22, 0)
    expect(formatGmtOffset(now)).toMatch(/^GMT[+-]\d+(:\d{2})?$/)
  })

  test('formatLocalDate 本地日期', () => {
    expect(formatLocalDate(new Date(2026, 7, 19, 22, 41))).toBe('2026-08-19')
  })
})

describe('dueDateLabel — 截止标签', () => {
  const today = '2026-08-19'
  test('今天 / 明天 / 无期限', () => {
    expect(dueDateLabel(today, today)).toBe('今天到期')
    expect(dueDateLabel(addDaysLocal(today, 1), today)).toBe('明天到期')
    expect(dueDateLabel(null, today)).toBe('无期限')
  })
  test('已过期 / 远期完整日期', () => {
    expect(dueDateLabel('2026-08-01', today)).toBe('已过期')
    expect(dueDateLabel('2026-12-31', today)).toBe('2026-12-31')
  })
})

describe('summarizeTasks — 任务概览段', () => {
  // 固定 now（本地时区构造，平台无关）：dueDate 相对它取「今天/明天」。
  const now = new Date(2026, 7, 19, 12, 0)
  const today = formatLocalDate(now)

  test('未完成任务 + 任务组；非 todo 被过滤', () => {
    const tasks = [
      { title: '写周报', status: 'todo', dueDate: today },
      { title: '整理照片', status: 'todo', dueDate: null },
      { title: '已完成的事', status: 'done', dueDate: addDaysLocal(today, -1) },
    ]
    const groups = [{ title: '工作' }, { title: '生活' }]
    const text = summarizeTasks(tasks, groups, now)
    expect(text).toContain('[任务概览]')
    expect(text).toContain('『写周报』(今天到期)')
    expect(text).toContain('『整理照片』(无期限)')
    expect(text).not.toContain('已完成的事')
    expect(text).toContain('任务组：工作 / 生活')
  })

  test('无 todo 任务时只输任务组；全空返回空串', () => {
    expect(summarizeTasks([], [{ title: '工作' }], now)).toContain('任务组：工作')
    expect(summarizeTasks([], [], now)).toBe('')
  })

  test('超过 8 条截断', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      title: `任务${i}`,
      status: 'todo' as const,
      dueDate: null,
    }))
    const text = summarizeTasks(tasks, [], now)
    expect(text.match(/『/g)?.length).toBe(SNAPSHOT_QUOTAS.maxTasks)
    expect(text).not.toContain('任务11')
  })
})

describe('summarizeEvents — 近期日程段', () => {
  // 固定 now（本地时区构造，平台无关）；事件用同一天/明天本地构造。
  const now = new Date(2026, 7, 19, 12, 0)

  test('今天 带时间与位置；非全天', () => {
    const events = [
      {
        title: '产品评审',
        startAt: new Date(2026, 7, 19, 15, 0).toISOString(),
        isAllDay: false,
        location: '会议室 A',
      },
    ]
    const text = summarizeEvents(events, now)
    expect(text).toContain('[近期日程]')
    expect(text).toContain('今天') // 同一天（本地时区）
    expect(text).toContain('产品评审 @会议室 A')
  })

  test('未来日期用 MM-DD 前缀；全天无时间', () => {
    const tomorrow = new Date(2026, 7, 20, 0, 0)
    const events = [
      {
        title: '搬家',
        startAt: tomorrow.toISOString(),
        isAllDay: true,
        location: null,
      },
    ]
    const text = summarizeEvents(events, now)
    expect(text).toMatch(/\d{2}-\d{2} 全天 搬家/)
    expect(text).toContain('08-20 全天 搬家')
  })

  test('空列表返回空串；超过 6 条截断', () => {
    expect(summarizeEvents([], now)).toBe('')
    const many = Array.from({ length: 9 }, (_, i) => ({
      title: `日程${i}`,
      startAt: new Date(2026, 7, 20, 10, 0).toISOString(),
      isAllDay: false,
      location: null,
    }))
    const text = summarizeEvents(many, now)
    expect(text.match(/日程\d/g)?.length).toBe(SNAPSHOT_QUOTAS.maxEvents)
    expect(text).not.toContain('日程8')
  })
})

describe('truncateText / summarizeMoments — 最新闪念段', () => {
  test('截断到 60 字并加省略号', () => {
    expect(truncateText('短文本', 60)).toBe('短文本')
    expect(truncateText('x'.repeat(70), 60)).toBe(`${'x'.repeat(60)}…`)
  })

  test('压缩换行、最多 3 条', () => {
    const moments = [
      { text: '想到一个\nApp 点子', createdAt: '2026-08-19T10:00:00+08:00' },
      { text: '二', createdAt: '2026-08-18T10:00:00+08:00' },
      { text: '三', createdAt: '2026-08-17T10:00:00+08:00' },
      { text: '四', createdAt: '2026-08-16T10:00:00+08:00' },
    ]
    const text = summarizeMoments(moments)
    expect(text).toContain('[最新闪念]')
    expect(text).toContain('『想到一个 App 点子』')
    expect(text).not.toContain('四')
    expect(text.match(/^- /gm)?.length).toBe(SNAPSHOT_QUOTAS.maxMoments)
  })

  test('空列表返回空串', () => {
    expect(summarizeMoments([])).toBe('')
  })
})

describe('summarizeHabits — 最近习惯段', () => {
  test('计数型显示总量日均；做没做型显示打卡天数', () => {
    const stats = [
      { name: '喝水', kind: 'countable', countable: true, doneDays: 7, totalCount: 14, days: 7 },
      { name: '跑步', kind: 'binary', countable: false, doneDays: 3, totalCount: 0, days: 7 },
    ]
    const text = summarizeHabits(stats)
    expect(text).toContain('[最近习惯]')
    expect(text).toContain('喝水（近 7 天共 14 次，日均 2.0）')
    expect(text).toContain('跑步（近 7 天打卡 3 天）')
  })

  test('空列表返回空串', () => {
    expect(summarizeHabits([])).toBe('')
  })
})

describe('fingerprintOf — 指纹拼接', () => {
  test('undefined 归一为空串，undefined 参与归一化', () => {
    expect(fingerprintOf([1, 'a'])).toBe('1:a')
    expect(fingerprintOf([1, undefined])).toBe('1:')
    expect(fingerprintOf([1, 'a'])).not.toBe(fingerprintOf([1, 'b']))
  })
})

describe('habitsFingerprint — 习惯段指纹', () => {
  const now = new Date(2026, 7, 19, 12, 0)
  const base = {
    habitsCount: 2,
    latestHabitUpdatedAt: '2026-08-18T10:00:00.000Z',
    latestDailyUpdatedAt: '2026-08-18T12:00:00.000Z',
  }

  test('完全不变 → 指纹不变', () => {
    const a = habitsFingerprint(
      now,
      base.habitsCount,
      base.latestHabitUpdatedAt,
      base.latestDailyUpdatedAt,
    )
    const b = habitsFingerprint(
      now,
      base.habitsCount,
      base.latestHabitUpdatedAt,
      base.latestDailyUpdatedAt,
    )
    expect(a).toBe(b)
  })

  test('只新增 habit_daily 打卡（habits 表不动）→ 指纹失效', () => {
    const before = habitsFingerprint(
      now,
      base.habitsCount,
      base.latestHabitUpdatedAt,
      base.latestDailyUpdatedAt,
    )
    const after = habitsFingerprint(
      now,
      base.habitsCount,
      base.latestHabitUpdatedAt,
      '2026-08-19T09:00:00.000Z',
    )
    expect(after).not.toBe(before)
  })

  test('新增习惯（count 变化）→ 指纹失效', () => {
    const before = habitsFingerprint(
      now,
      base.habitsCount,
      base.latestHabitUpdatedAt,
      base.latestDailyUpdatedAt,
    )
    const after = habitsFingerprint(now, 3, base.latestHabitUpdatedAt, base.latestDailyUpdatedAt)
    expect(after).not.toBe(before)
  })

  test('跨天（数据不变、日期变化）→ 指纹失效（刷新“今天”基准）', () => {
    const day1 = habitsFingerprint(
      new Date(2026, 7, 19, 23, 59),
      base.habitsCount,
      base.latestHabitUpdatedAt,
      base.latestDailyUpdatedAt,
    )
    const day2 = habitsFingerprint(
      new Date(2026, 7, 20, 0, 0),
      base.habitsCount,
      base.latestHabitUpdatedAt,
      base.latestDailyUpdatedAt,
    )
    expect(day2).not.toBe(day1)
  })
})

describe('buildDynamicSnapshot — 指纹缓存与降级（fake sources）', () => {
  const now = new Date('2026-08-19T12:00:00+08:00')

  function fakeSource(
    key: string,
    texts: string[],
  ): {
    src: ReturnType<typeof makeSource>
    loadCount: () => number
  } {
    let n = 0
    const text = texts[0]
    const src = makeSource({
      key,
      fingerprint: async () => (text === 'changed' ? 'fp-b' : 'fp-a'),
      load: async () => {
        n++
        const t = text === 'changed' ? 'changed-text' : 'current-text'
        void t
        return text
      },
    })
    return { src, loadCount: () => n }
  }
  function makeSource(over: {
    key: string
    fingerprint: () => Promise<string>
    load: () => Promise<string>
  }) {
    return { ...over, section: (t: string) => `[段]${t}` }
  }

  test('指纹未变：复用缓存，load 只调用一次', async () => {
    const cache = new Map()
    const { src, loadCount } = fakeSource('k1', ['A'])
    await buildDynamicSnapshot(now, [src], cache)
    expect(loadCount()).toBe(1)
    const text = await buildDynamicSnapshot(now, [src], cache)
    expect(loadCount()).toBe(1) // 未重现查询
    expect(text).toContain('A')
    expect(text).toContain('[当前时间]')
  })

  test('指纹变化：重新 load 并更新缓存', async () => {
    const cache = new Map()
    const calls: string[] = []
    let fp = 'fp-1'
    const src = makeSource({
      key: 'k2',
      fingerprint: async () => fp,
      load: async () => {
        calls.push(fp)
        return `text-${fp}`
      },
    })
    await buildDynamicSnapshot(now, [src], cache)
    fp = 'fp-2'
    const text = await buildDynamicSnapshot(now, [src], cache)
    expect(calls).toEqual(['fp-1', 'fp-2'])
    expect(text).toContain('text-fp-2')
  })

  test('某段 load 抛错：跳过该段，其余段与时间块保留', async () => {
    const cache = new Map()
    const bad = makeSource({
      key: 'bad',
      fingerprint: async () => 'fp-b',
      load: async () => {
        throw new Error('db down')
      },
    })
    const good = makeSource({
      key: 'good',
      fingerprint: async () => 'fp-g',
      load: async () => 'G',
    })
    const text = await buildDynamicSnapshot(now, [bad, good], cache)
    expect(text).toContain('G')
    expect(text).not.toContain('坏')
    expect(text).toContain('[当前时间]')
  })
})
