import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import {
  getAuditUnreadCount,
  listAuditLogs,
  markAuditRead,
  type AuditLogEntry,
} from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPut = vi.mocked(api.put)

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'log1',
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

describe('listAuditLogs', () => {
  it('默认 page/pageSize，解出 { items, total }', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ items: [makeLog()], total: 1 }))
    const result = await listAuditLogs()
    expect(result.total).toBe(1)
    expect(result.items[0].event).toBe('auth.login')
    const [url, opts] = mockedGet.mock.calls[0]
    expect(url).toBe('/api/audit/logs')
    expect(opts?.searchParams).toEqual({ page: '1', pageSize: '20' })
  })

  it('透传 level / event / unreadOnly 筛选参数', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ items: [], total: 0 }))
    await listAuditLogs({ page: 2, pageSize: 50, level: 'error', event: 'blob.delete', unreadOnly: true })
    const [url, opts] = mockedGet.mock.calls[0]
    expect(url).toBe('/api/audit/logs')
    expect(opts?.searchParams).toEqual({
      page: '2',
      pageSize: '50',
      level: 'error',
      event: 'blob.delete',
      unreadOnly: 'true',
    })
  })
})

describe('getAuditUnreadCount', () => {
  it('GET unread-count 并解出 { unreadCount }', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ unreadCount: 3 }))
    const result = await getAuditUnreadCount()
    expect(result.unreadCount).toBe(3)
    expect(mockedGet).toHaveBeenCalledWith('/api/audit/logs/unread-count')
  })
})

describe('markAuditRead', () => {
  it('空数组/缺省 → 空 body（全部置已读）', async () => {
    mockedPut
      .mockResolvedValueOnce(jsonResponse({ updatedCount: 10, unreadCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({ updatedCount: 3, unreadCount: 0 }))
    const result = await markAuditRead()
    expect(result.unreadCount).toBe(0)
    expect(mockedPut).toHaveBeenCalledWith('/api/audit/logs/read', { json: {} })

    await markAuditRead([])
    expect(mockedPut).toHaveBeenLastCalledWith('/api/audit/logs/read', { json: {} })
  })

  it('带 ids → body { ids } 精准标记', async () => {
    mockedPut.mockResolvedValue(jsonResponse({ updatedCount: 2, unreadCount: 0 }))
    await markAuditRead(['a', 'b'])
    expect(mockedPut).toHaveBeenCalledWith('/api/audit/logs/read', { json: { ids: ['a', 'b'] } })
  })
})
