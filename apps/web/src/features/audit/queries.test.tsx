import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuditLogEntry } from './api'
import { getAuditUnreadCount, listAuditLogs, markAuditRead } from './api'
import { useAuditLogs, useAuditUnreadCount, useMarkAuditRead } from './queries'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('./api', () => ({
  listAuditLogs: vi.fn(),
  getAuditUnreadCount: vi.fn(),
  markAuditRead: vi.fn(),
}))

const mockedList = vi.mocked(listAuditLogs)
const mockedUnread = vi.mocked(getAuditUnreadCount)
const mockedMarkRead = vi.mocked(markAuditRead)
const mockedToast = vi.mocked(toast.success)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function makeLog(id: string, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id,
    event: 'auth.login',
    message: '登录成功',
    level: 'info',
    source: null,
    ip: '127.0.0.1',
    detail: null,
    isRead: false,
    createdAt: '2026-08-08T01:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => vi.clearAllMocks())

describe('useAuditLogs', () => {
  it('按参数请求并返回 { items, total }', async () => {
    mockedList.mockResolvedValue({ items: [makeLog('a')], total: 1 })
    const { result } = renderHook(() => useAuditLogs({ page: 1, pageSize: 20, level: 'warn' }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(1)
    expect(result.current.data?.items[0].id).toBe('a')
    expect(mockedList).toHaveBeenCalledWith({ page: 1, pageSize: 20, level: 'warn' })
  })
})

describe('useAuditUnreadCount', () => {
  it('返回未读数', async () => {
    mockedUnread.mockResolvedValue({ unreadCount: 5 })
    const { result } = renderHook(() => useAuditUnreadCount(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.unreadCount).toBe(5)
  })
})

describe('useMarkAuditRead', () => {
  it('无参调用（全部置已读）并提示成功', async () => {
    mockedMarkRead.mockResolvedValue({ updatedCount: 3, unreadCount: 0 })
    const { result } = renderHook(() => useMarkAuditRead(), { wrapper })

    await act(async () => {
      result.current.mutate(undefined)
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedMarkRead).toHaveBeenCalledWith(undefined)
    expect(mockedToast).toHaveBeenCalledWith('已将 3 条日志标记为已读')
  })

  it('带 ids 精准标记', async () => {
    mockedMarkRead.mockResolvedValue({ updatedCount: 2, unreadCount: 0 })
    const { result } = renderHook(() => useMarkAuditRead(), { wrapper })

    await act(async () => {
      result.current.mutate(['a', 'b'])
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockedMarkRead).toHaveBeenCalledWith(['a', 'b'])
  })
})
