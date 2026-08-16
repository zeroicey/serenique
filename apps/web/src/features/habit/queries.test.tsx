import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HabitDailyEntry, HabitEntry } from './api'
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
import {
  useClearDaily,
  useCreateHabit,
  useDeleteHabit,
  useHabitDaily,
  useHabitOverview,
  useHabits,
  useSetDaily,
  useUpdateHabit,
} from './queries'

vi.mock('./api', () => ({
  listHabits: vi.fn(),
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  deleteHabit: vi.fn(),
  listHabitDaily: vi.fn(),
  setHabitDaily: vi.fn(),
  clearHabitDaily: vi.fn(),
  getHabitOverview: vi.fn(),
}))

const mockedList = vi.mocked(listHabits)
const mockedCreate = vi.mocked(createHabit)
const mockedUpdate = vi.mocked(updateHabit)
const mockedDelete = vi.mocked(deleteHabit)
const mockedListDaily = vi.mocked(listHabitDaily)
const mockedSetDaily = vi.mocked(setHabitDaily)
const mockedClearDaily = vi.mocked(clearHabitDaily)
const mockedOverview = vi.mocked(getHabitOverview)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function makeHabit(id: string): HabitEntry {
  return {
    id,
    name: `习惯${id}`,
    description: null,
    kind: 'good',
    countable: false,
    sortOrder: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

function makeDaily(habitId: string): HabitDailyEntry {
  return {
    habitId,
    status: 'done',
    count: 0,
  }
}

afterEach(() => vi.clearAllMocks())

describe('useHabits', () => {
  it('拉取习惯列表', async () => {
    mockedList.mockResolvedValue([makeHabit('h1')])
    const { result } = renderHook(() => useHabits(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })
})

describe('useHabitDaily', () => {
  it('按日期拉取每日状态', async () => {
    mockedListDaily.mockResolvedValue([makeDaily('h1')])
    const { result } = renderHook(() => useHabitDaily('2026-08-16'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedListDaily).toHaveBeenCalledWith('2026-08-16')
  })
})

describe('useHabitOverview', () => {
  it('按窗口拉取总览', async () => {
    mockedOverview.mockResolvedValue({ days: 7, byDate: {}, stats: [] })
    const { result } = renderHook(() => useHabitOverview(7), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedOverview).toHaveBeenCalledWith(7)
  })
})

describe('useCreateHabit', () => {
  it('调用 createHabit 并传入输入', async () => {
    mockedCreate.mockResolvedValue(makeHabit('h9'))
    const { result } = renderHook(() => useCreateHabit(), { wrapper })
    act(() => {
      result.current.mutate({ name: '喝水', kind: 'good', countable: true })
    })
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    expect(mockedCreate.mock.calls[0][0]).toEqual({
      name: '喝水',
      kind: 'good',
      countable: true,
    })
  })
})

describe('useUpdateHabit', () => {
  it('拆开 id 并调用 updateHabit(id, patch)', async () => {
    mockedUpdate.mockResolvedValue(makeHabit('h1'))
    const { result } = renderHook(() => useUpdateHabit(), { wrapper })
    act(() => {
      result.current.mutate({ id: 'h1', name: '晨跑' })
    })
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    expect(mockedUpdate.mock.calls[0][0]).toBe('h1')
    expect(mockedUpdate.mock.calls[0][1]).toEqual({ name: '晨跑' })
  })
})

describe('useDeleteHabit', () => {
  it('调用 deleteHabit(id)', async () => {
    mockedDelete.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteHabit(), { wrapper })
    act(() => {
      result.current.mutate('h1')
    })
    await waitFor(() => expect(mockedDelete).toHaveBeenCalled())
    expect(mockedDelete.mock.calls[0][0]).toBe('h1')
  })
})

describe('useSetDaily', () => {
  it('调用 setHabitDaily(input)', async () => {
    mockedSetDaily.mockResolvedValue(makeDaily('h1'))
    const { result } = renderHook(() => useSetDaily(), { wrapper })
    act(() => {
      result.current.mutate({ habitId: 'h1', date: '2026-08-16', status: 'done' })
    })
    await waitFor(() => expect(mockedSetDaily).toHaveBeenCalled())
    expect(mockedSetDaily.mock.calls[0][0]).toEqual({
      habitId: 'h1',
      date: '2026-08-16',
      status: 'done',
    })
  })
})

describe('useClearDaily', () => {
  it('拆开并调用 clearHabitDaily(habitId, date)', async () => {
    mockedClearDaily.mockResolvedValue(undefined)
    const { result } = renderHook(() => useClearDaily(), { wrapper })
    act(() => {
      result.current.mutate({ habitId: 'h1', date: '2026-08-16' })
    })
    await waitFor(() => expect(mockedClearDaily).toHaveBeenCalled())
    expect(mockedClearDaily.mock.calls[0][0]).toBe('h1')
    expect(mockedClearDaily.mock.calls[0][1]).toBe('2026-08-16')
  })
})
