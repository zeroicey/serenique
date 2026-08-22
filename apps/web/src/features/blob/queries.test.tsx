import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type BlobEntry, deleteBlob, listBlobAttachments, listBlobs } from './api'
import { useBlobAttachments, useBlobLibrary, useDeleteBlob } from './queries'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('./api', () => ({
  listBlobs: vi.fn(),
  deleteBlob: vi.fn(),
  listBlobAttachments: vi.fn(),
}))

const mockedList = vi.mocked(listBlobs)
const mockedDelete = vi.mocked(deleteBlob)
const mockedAttachments = vi.mocked(listBlobAttachments)

function makeBlob(id: string): BlobEntry {
  return {
    id,
    originalName: `${id}.png`,
    mimeType: 'image/png',
    size: 10,
    checksum: 'x',
    metadata: {},
    width: null,
    height: null,
    duration: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    refCount: 0,
  }
}

const wrapPage = (items: BlobEntry[], total: number) => ({ items, total })

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useBlobLibrary', () => {
  it('下一页：满页时推进页码，不足满页（末页）时停止', async () => {
    mockedList
      .mockResolvedValueOnce(wrapPage([makeBlob('a1'), makeBlob('a2')], 5))
      .mockResolvedValueOnce(wrapPage([makeBlob('a3'), makeBlob('a4')], 5))

    const { result } = renderHook(() => useBlobLibrary({ pageSize: 2 }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(mockedList).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 2, mimeType: undefined })
    expect(result.current.data?.pages.flatMap((p) => p.items)).toHaveLength(4)
    // 已加载 4/5 → 还有 1 条未加载
    expect(result.current.hasNextPage).toBe(true)

    mockedList.mockResolvedValueOnce(wrapPage([makeBlob('a5')], 5))
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(3))
    expect(result.current.hasNextPage).toBe(false)
  })

  it('携带 mimeType 前缀过滤', async () => {
    mockedList.mockResolvedValueOnce(wrapPage([], 0))

    const { result } = renderHook(() => useBlobLibrary({ pageSize: 48, mimeType: 'image/' }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedList).toHaveBeenCalledWith({ page: 1, pageSize: 48, mimeType: 'image/' })
    expect(result.current.data?.pages[0].items).toHaveLength(0)
  })
})

describe('useDeleteBlob', () => {
  it('mutate 触发 deleteBlob 并 toast 成功', async () => {
    mockedDelete.mockResolvedValueOnce({ deleted: true, deleteUrls: [] })

    const { result } = renderHook(() => useDeleteBlob(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('b1')
    })

    expect(mockedDelete).toHaveBeenCalledWith('b1')
    expect(toast.success).toHaveBeenCalledWith('文件已删除')
  })

  it('失败时 toast 错误信息', async () => {
    mockedDelete.mockRejectedValueOnce(new Error('文件仍被业务记录引用，请先删除关联'))

    const { result } = renderHook(() => useDeleteBlob(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('b1').catch(() => {})
    })

    expect(toast.error).toHaveBeenCalledWith('文件仍被业务记录引用，请先删除关联')
  })
})

describe('useBlobAttachments', () => {
  it('blobId 为 null 时不发请求', async () => {
    const { result } = renderHook(() => useBlobAttachments(null), { wrapper })

    // enabled:false 的 query 恒为 pending（无数据），等一个 tick 后确认未发请求即可
    await act(async () => {})
    expect(mockedAttachments).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('blobId 非 null 时查询引用列表', async () => {
    mockedAttachments.mockResolvedValueOnce([
      {
        id: 'a1',
        blobId: 'b1',
        ownerType: 'moment',
        ownerId: 'm1',
        role: 'attachment',
        displayName: null,
        sortOrder: 0,
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    ])

    const { result } = renderHook(() => useBlobAttachments('b1'), { wrapper })

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(mockedAttachments).toHaveBeenCalledWith('b1')
    expect(result.current.data?.[0].ownerType).toBe('moment')
  })
})
