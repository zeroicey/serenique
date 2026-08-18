import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { createTag, deleteTag, listTags, renameTag, type TagEntry } from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)
const mockedPut = vi.mocked(api.put)
const mockedDelete = vi.mocked(api.delete)

function jsonResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, message: 'ok', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeTag(id = 't1'): TagEntry {
  return {
    id,
    name: '工作',
    momentCount: 3,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

afterEach(() => vi.clearAllMocks())

describe('listTags', () => {
  it('默认 page/pageSize=50，解出 { items, total }', async () => {
    mockedGet.mockResolvedValue(jsonResponse({ items: [makeTag()], total: 1 }))
    const result = await listTags()
    expect(result.items[0].name).toBe('工作')
    const [, opts] = mockedGet.mock.calls[0]
    expect(opts?.searchParams).toEqual({ page: '1', pageSize: '50' })
  })
})

describe('createTag', () => {
  it('POST /tags 携带 name', async () => {
    mockedPost.mockResolvedValue(jsonResponse(makeTag()))
    await createTag('工作')
    const [url, opts] = mockedPost.mock.calls[0]
    expect(url).toBe('/api/tags')
    expect(opts?.json).toEqual({ name: '工作' })
  })
})

describe('renameTag', () => {
  it('PUT /tags/:id 携带 name', async () => {
    mockedPut.mockResolvedValue(jsonResponse(makeTag()))
    await renameTag('t1', '生活')
    const [url, opts] = mockedPut.mock.calls[0]
    expect(url).toBe('/api/tags/t1')
    expect(opts?.json).toEqual({ name: '生活' })
  })
})

describe('deleteTag', () => {
  it('204 直接返回，不解析 body', async () => {
    mockedDelete.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteTag('t1')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/tags/t1')
  })
})
