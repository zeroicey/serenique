import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMomentComment, deleteMomentComment, listMomentComments, listMoments } from './api'
import {
  useCreateMomentComment,
  useDeleteMomentComment,
  useMomentComments,
  useMoments,
} from './queries'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('./api', () => ({
  listMoments: vi.fn(),
  createMoment: vi.fn(),
  deleteMoment: vi.fn(),
  removeMomentAttachment: vi.fn(),
  listMomentComments: vi.fn(),
  createMomentComment: vi.fn(),
  deleteMomentComment: vi.fn(),
}))

const mockedList = vi.mocked(listMoments)
const mockedListComments = vi.mocked(listMomentComments)
const mockedCreateComment = vi.mocked(createMomentComment)
const mockedDeleteComment = vi.mocked(deleteMomentComment)
const mockedToast = vi.mocked(toast.success)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useMoments', () => {
  it('满页时推进页码，不足满页时停止', async () => {
    mockedList
      .mockResolvedValueOnce({
        items: Array.from({ length: 10 }, (_, i) => makeMoment(i)),
        total: 25,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 10 }, (_, i) => makeMoment(10 + i)),
        total: 25,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 5 }, (_, i) => makeMoment(20 + i)),
        total: 25,
      })

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

  it('keyword 变化后带 q 从第 1 页重新拉取（不沿用旧分页）', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [makeMoment(0)], total: 1 })
      .mockResolvedValueOnce({ items: [makeMoment(1)], total: 1 })

    const { result, rerender } = renderHook(({ kw }) => useMoments(10, kw), {
      initialProps: { kw: '' },
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedList).toHaveBeenCalledTimes(1)
    expect(result.current.data?.pages[0]?.items[0]?.id).toBe('m0')

    rerender({ kw: 'beijing' })
    await waitFor(() => expect(result.current.data?.pages[0]?.items[0]?.id).toBe('m1'))
    expect(mockedList).toHaveBeenCalledTimes(2)
    expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, q: 'beijing' })
    expect(result.current.data?.pages).toHaveLength(1)
  })
})

describe('useMomentComments', () => {
  it('返回评论列表（时间正序）', async () => {
    mockedListComments.mockResolvedValueOnce([
      makeComment('c1', '第一条'),
      makeComment('c2', '第二条'),
    ])
    const { result } = renderHook(() => useMomentComments('m1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(mockedListComments).toHaveBeenCalledWith('m1')
  })

  it('enabled=false 时不发请求', async () => {
    const { result } = renderHook(() => useMomentComments('m1', false), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mockedListComments).not.toHaveBeenCalled()
  })
})

describe('useCreateMomentComment', () => {
  it('调用 API 并提示成功', async () => {
    mockedCreateComment.mockResolvedValueOnce(makeComment('c1', '新评论'))
    const { result } = renderHook(() => useCreateMomentComment(), { wrapper })

    await act(async () => {
      result.current.mutate({ momentId: 'm1', content: '新评论' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedCreateComment).toHaveBeenCalledWith('m1', '新评论')
    expect(mockedToast).toHaveBeenCalledWith('评论发布成功')
  })
})

describe('useDeleteMomentComment', () => {
  it('调用 API 并提示成功', async () => {
    mockedDeleteComment.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useDeleteMomentComment(), { wrapper })

    await act(async () => {
      result.current.mutate({ momentId: 'm1', commentId: 'c1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedDeleteComment).toHaveBeenCalledWith('m1', 'c1')
    expect(mockedToast).toHaveBeenCalledWith('评论已删除')
  })
})

function makeMoment(i: number) {
  return {
    id: `m${i}`,
    text: `t${i}`,
    location: null,
    attachments: [],
    comments: [],
    commentCount: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

function makeComment(id: string, content: string) {
  return {
    id,
    momentId: 'm1',
    content,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}
