import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventEntry } from './api'
import { createEvent, deleteEvent, listEvents, updateEvent } from './api'
import { useCreateEvent, useDeleteEvent, useEvents, useUpdateEvent } from './queries'

vi.mock('./api', () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEvent: vi.fn(),
}))

const mockedList = vi.mocked(listEvents)
const mockedCreate = vi.mocked(createEvent)
const mockedUpdate = vi.mocked(updateEvent)
const mockedDelete = vi.mocked(deleteEvent)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function makeEvent(id: string, startAt: string): EventEntry {
  return {
    id,
    title: `事件 ${id}`,
    startAt,
    endAt: startAt,
    isAllDay: false,
    location: null,
    note: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

afterEach(() => vi.clearAllMocks())

describe('useEvents', () => {
  it('按日期窗口拉取并返回 startAt 升序', async () => {
    mockedList.mockResolvedValue([
      makeEvent('a', '2026-08-06T03:00:00.000Z'),
      makeEvent('b', '2026-08-06T01:00:00.000Z'),
    ])
    const { result } = renderHook(() => useEvents('2026-08-06'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedList).toHaveBeenCalledTimes(1)
    const [from, to] = mockedList.mock.calls[0]
    expect(new Date(from).getDate()).toBe(6)
    expect(new Date(to).getDate()).toBe(7)
    expect(result.current.data?.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('useCreateEvent', () => {
  it('调用 createEvent 并传入输入', async () => {
    mockedCreate.mockResolvedValue(makeEvent('ev9', '2026-08-06T01:00:00.000Z'))
    const { result } = renderHook(() => useCreateEvent(), { wrapper })
    act(() => {
      result.current.mutate({ title: '晨会', startAt: 'x', endAt: 'y' })
    })
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    expect(mockedCreate.mock.calls[0][0]).toEqual({ title: '晨会', startAt: 'x', endAt: 'y' })
  })
})

describe('useUpdateEvent', () => {
  it('拆开 id 并调用 updateEvent(id, patch)', async () => {
    mockedUpdate.mockResolvedValue(makeEvent('ev1', '2026-08-06T01:00:00.000Z'))
    const { result } = renderHook(() => useUpdateEvent(), { wrapper })
    act(() => {
      result.current.mutate({ id: 'ev1', title: '评审' })
    })
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled())
    expect(mockedUpdate.mock.calls[0][0]).toBe('ev1')
    expect(mockedUpdate.mock.calls[0][1]).toEqual({ title: '评审' })
  })
})

describe('useDeleteEvent', () => {
  it('调用 deleteEvent(id)', async () => {
    mockedDelete.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteEvent(), { wrapper })
    act(() => {
      result.current.mutate('ev1')
    })
    // React Query v5 mutationFn 会传第二个 context 参数，用 mock.calls[0][0] 断言首参（task 坑 ⑤）。
    await waitFor(() => expect(mockedDelete).toHaveBeenCalled())
    expect(mockedDelete.mock.calls[0][0]).toBe('ev1')
  })
})
