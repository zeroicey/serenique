import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import type { HabitDailyEntry, HabitEntry, HabitOverview } from './api'
import {
  clearHabitDaily,
  createHabit,
  deleteHabit,
  getHabitOverview,
  listHabitDaily,
  listHabits,
  setHabitDaily,
  updateHabit,
} from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)
const mockedPut = vi.mocked(api.put)
const mockedDelete = vi.mocked(api.delete)

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeHabit(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'h1',
    name: '跑步',
    kind: 'good',
    countable: false,
    sortOrder: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeDaily(overrides: Partial<HabitDailyEntry> = {}): HabitDailyEntry {
  return {
    habitId: 'h1',
    status: 'done',
    count: 0,
    note: null,
    ...overrides,
  }
}

afterEach(() => vi.clearAllMocks())

describe('listHabits', () => {
  it('GET /api/habits 返回裸数组', async () => {
    mockedGet.mockResolvedValue(jsonResponse([makeHabit()]))
    const result = await listHabits()
    expect(result).toHaveLength(1)
    expect(mockedGet).toHaveBeenCalledWith('/api/habits')
  })
})

describe('createHabit', () => {
  it('POST 创建并解出 HabitEntry', async () => {
    mockedPost.mockResolvedValue(jsonResponse(makeHabit()))
    const result = await createHabit({ name: '喝水', kind: 'good', countable: true })
    expect(result.name).toBe('跑步')
    expect(mockedPost).toHaveBeenCalledWith('/api/habits', {
      json: { name: '喝水', kind: 'good', countable: true },
    })
  })
})

describe('updateHabit', () => {
  it('PUT 到 /api/habits/:id', async () => {
    mockedPut.mockResolvedValue(jsonResponse(makeHabit({ name: '晨跑' })))
    const result = await updateHabit('h1', { name: '晨跑', sortOrder: 2 })
    expect(result.name).toBe('晨跑')
    expect(mockedPut).toHaveBeenCalledWith('/api/habits/h1', {
      json: { name: '晨跑', sortOrder: 2 },
    })
  })
})

describe('deleteHabit', () => {
  it('204 时直接返回', async () => {
    mockedDelete.mockResolvedValue({ status: 204 } as Response)
    await expect(deleteHabit('h1')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/habits/h1')
  })
})

describe('listHabitDaily', () => {
  it('以 date searchParam 请求并解出裸数组', async () => {
    mockedGet.mockResolvedValue(jsonResponse([makeDaily()]))
    const result = await listHabitDaily('2026-08-16')
    expect(result).toHaveLength(1)
    expect(mockedGet).toHaveBeenCalledWith('/api/habit-daily', {
      searchParams: { date: '2026-08-16' },
    })
  })
})

describe('setHabitDaily', () => {
  it('PUT 到 /api/habits/:habitId/daily/:date，body 为剩余字段', async () => {
    mockedPut.mockResolvedValue(jsonResponse(makeDaily({ status: 'done' })))
    const result = await setHabitDaily({ habitId: 'h1', date: '2026-08-16', status: 'done' })
    expect(result.status).toBe('done')
    expect(mockedPut).toHaveBeenCalledWith('/api/habits/h1/daily/2026-08-16', {
      json: { status: 'done' },
    })
  })

  it('计数型只传 count', async () => {
    mockedPut.mockResolvedValue(jsonResponse(makeDaily({ status: null, count: 3 })))
    await setHabitDaily({ habitId: 'h1', date: '2026-08-16', count: 3 })
    expect(mockedPut).toHaveBeenCalledWith('/api/habits/h1/daily/2026-08-16', {
      json: { count: 3 },
    })
  })

  it('仅备注时不带 status/count', async () => {
    mockedPut.mockResolvedValue(jsonResponse(makeDaily({ status: null, count: 0, note: '5km' })))
    await setHabitDaily({ habitId: 'h1', date: '2026-08-16', note: '5km' })
    expect(mockedPut).toHaveBeenCalledWith('/api/habits/h1/daily/2026-08-16', {
      json: { note: '5km' },
    })
  })
})

describe('clearHabitDaily', () => {
  it('DELETE 到 /api/habits/:habitId/daily/:date，204 直接返回', async () => {
    mockedDelete.mockResolvedValue({ status: 204 } as Response)
    await expect(clearHabitDaily('h1', '2026-08-16')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/habits/h1/daily/2026-08-16')
  })
})

describe('getHabitOverview', () => {
  it('GET /api/habit-daily/overview 带 days 参数', async () => {
    const overview: HabitOverview = {
      days: 30,
      byDate: {},
      stats: [],
    }
    mockedGet.mockResolvedValue(jsonResponse(overview))
    const result = await getHabitOverview(30)
    expect(result.days).toBe(30)
    expect(mockedGet).toHaveBeenCalledWith('/api/habit-daily/overview', {
      searchParams: { days: '30' },
    })
  })
})
