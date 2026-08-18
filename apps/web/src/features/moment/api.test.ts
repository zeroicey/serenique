import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { listMoments, type MomentEntry } from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)

function jsonResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, message: 'ok', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMoment(id = 'm1'): MomentEntry {
  return {
    id,
    text: '测试内容',
    location: null,
    attachments: [],
    comments: [],
    commentCount: 0,
    tags: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

afterEach(() => vi.clearAllMocks())

describe('listMoments', () => {
  it('默认 page/pageSize，解出 { items, total }', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ items: [makeMoment()], total: 1 }))
    const result = await listMoments()
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('m1')
    const [url, opts] = mockedGet.mock.calls[0]
    expect(url).toBe('/api/moments')
    expect(opts?.searchParams).toEqual({ page: '1', pageSize: '10' })
  })

  it('q 非空时拼入 searchParams（与 page/pageSize 正交）', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ items: [], total: 0 }))
    await listMoments({ page: 2, pageSize: 20, q: 'beijing' })
    const [, opts] = mockedGet.mock.calls[0]
    expect(opts?.searchParams).toEqual({ page: '2', pageSize: '20', q: 'beijing' })
  })

  it('q 为空白字符时省略，返回全量列表', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ items: [], total: 0 }))
    await listMoments({ q: '   ' })
    const [, opts] = mockedGet.mock.calls[0]
    expect(opts?.searchParams).toEqual({ page: '1', pageSize: '10' })
  })
})
