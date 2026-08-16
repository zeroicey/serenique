import { describe, expect, it } from 'vitest'
import type { HabitDailyEntry, HabitEntry, OverviewRecord, OverviewStat } from './api'
import {
  dailyByHabit,
  monthDayLabel,
  overviewDayList,
  shiftDate,
  sortHabits,
  sortStats,
  statText,
  weekdayLabel,
} from './lib'

function makeHabit(id: string, overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id,
    name: `习惯${id}`,
    kind: 'good',
    countable: false,
    sortOrder: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeDaily(habitId: string, overrides: Partial<HabitDailyEntry> = {}): HabitDailyEntry {
  return {
    habitId,
    status: 'done',
    count: 0,
    note: null,
    ...overrides,
  }
}

describe('shiftDate', () => {
  it('前后一天（含跨月/跨年）', () => {
    expect(shiftDate('2026-08-16', 1)).toBe('2026-08-17')
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('sortHabits', () => {
  it('按 sortOrder 升序，同序按 createdAt 升序', () => {
    const a = makeHabit('a', { sortOrder: 1, createdAt: '2026-08-05T00:00:00.000Z' })
    const b = makeHabit('b', { sortOrder: 0, createdAt: '2026-08-06T00:00:00.000Z' })
    const c = makeHabit('c', { sortOrder: 0, createdAt: '2026-08-04T00:00:00.000Z' })
    expect([a, b, c].sort(sortHabits).map((h) => h.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('dailyByHabit', () => {
  it('habitId → 记录 Map', () => {
    const map = dailyByHabit([makeDaily('h1'), makeDaily('h2', { status: null, count: 3 })])
    expect(map.size).toBe(2)
    expect(map.get('h1')?.status).toBe('done')
    expect(map.get('h2')?.count).toBe(3)
    expect(map.get('h3')).toBeUndefined()
  })
})

describe('overviewDayList', () => {
  it('按日期倒序展开', () => {
    const record = (habitId: string): OverviewRecord => ({
      ...makeDaily(habitId),
      name: habitId,
      kind: 'good',
      countable: false,
    })
    const list = overviewDayList({
      '2026-08-16': [record('h1')],
      '2026-08-14': [record('h2')],
      '2026-08-15': [record('h3')],
    })
    expect(list.map((d) => d.date)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14'])
  })
})

describe('sortStats', () => {
  it('按习惯列表 sortOrder 排序，未知习惯兜底', () => {
    const stats: OverviewStat[] = [
      {
        habitId: 'h2',
        name: 'B',
        kind: 'good',
        countable: false,
        doneDays: 1,
        notDoneDays: 0,
        totalCount: 0,
      },
      {
        habitId: 'h1',
        name: 'A',
        kind: 'good',
        countable: false,
        doneDays: 2,
        notDoneDays: 0,
        totalCount: 0,
      },
      {
        habitId: 'hX',
        name: 'X',
        kind: 'good',
        countable: false,
        doneDays: 0,
        notDoneDays: 0,
        totalCount: 0,
      },
    ]
    const order = new Map([
      ['h1', 0],
      ['h2', 5],
    ])
    expect(sortStats(stats, order).map((s) => s.habitId)).toEqual(['h1', 'h2', 'hX'])
  })
})

describe('weekdayLabel / monthDayLabel', () => {
  it('2026-08-16 是周日', () => {
    expect(weekdayLabel('2026-08-16')).toBe('周日')
  })
  it('monthDayLabel 返回 MM-DD', () => {
    expect(monthDayLabel('2026-08-16')).toBe('08-16')
  })
})

describe('statText', () => {
  it('做没做型显示 N/M 天', () => {
    const stat: OverviewStat = {
      habitId: 'h1',
      name: '跑步',
      kind: 'good',
      countable: false,
      doneDays: 4,
      notDoneDays: 1,
      totalCount: 0,
    }
    expect(statText(stat, 7)).toBe('4/7 天')
  })
  it('计数型显示总次数', () => {
    const stat: OverviewStat = {
      habitId: 'h1',
      name: '喝水',
      kind: 'good',
      countable: true,
      doneDays: 0,
      notDoneDays: 0,
      totalCount: 12,
    }
    expect(statText(stat, 7)).toBe('共 12 次')
  })
})
