import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { listMoments } from './api'
import { useMoments } from './queries'

vi.mock('./api', () => ({
  listMoments: vi.fn(),
  createMoment: vi.fn(),
  deleteMoment: vi.fn(),
  removeMomentAttachment: vi.fn(),
}))

const mockedList = vi.mocked(listMoments)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useMoments', () => {
  it('满页时推进页码，不足满页时停止', async () => {
    mockedList
      .mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, i) => makeMoment(i)), total: 25 })
      .mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, i) => makeMoment(10 + i)), total: 25 })
      .mockResolvedValueOnce({ items: Array.from({ length: 5 }, (_, i) => makeMoment(20 + i)), total: 25 })

    const { result } = renderHook(() => useMoments(10), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(3))
    expect(result.current.hasNextPage).toBe(false)
  })
})

function makeMoment(i: number) {
  return {
    id: `m${i}`,
    text: `t${i}`,
    attachments: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}
