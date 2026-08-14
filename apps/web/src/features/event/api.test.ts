import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import type { EventEntry } from './api'
import { createEvent, deleteEvent, listEvents, updateEvent } from './api'

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

function makeEvent(overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id: 'ev1',
    title: '晨会',
    startAt: '2026-08-06T01:00:00.000Z',
    endAt: '2026-08-06T02:00:00.000Z',
    isAllDay: false,
    location: null,
    note: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => vi.clearAllMocks())

describe('listEvents', () => {
  it('以 from/to searchParams 请求并解出裸数组', async () => {
    mockedGet.mockResolvedValue(jsonResponse([makeEvent(), makeEvent({ id: 'ev2' })]))
    const result = await listEvents('2026-08-06T00:00:00.000Z', '2026-08-07T00:00:00.000Z')
    expect(result).toHaveLength(2)
    expect(mockedGet).toHaveBeenCalledTimes(1)
    const [url, opts] = mockedGet.mock.calls[0]
    expect(url).toBe('/api/events')
    expect(opts?.searchParams).toEqual({
      from: '2026-08-06T00:00:00.000Z',
      to: '2026-08-07T00:00:00.000Z',
    })
  })
})

describe('createEvent', () => {
  it('POST 创建并解出 EventEntry', async () => {
    mockedPost.mockResolvedValue(jsonResponse(makeEvent()))
    const result = await createEvent({ title: '晨会', startAt: 'x', endAt: 'y', isAllDay: false })
    expect(result.title).toBe('晨会')
    expect(mockedPost).toHaveBeenCalledWith('/api/events', {
      json: { title: '晨会', startAt: 'x', endAt: 'y', isAllDay: false },
    })
  })
})

describe('updateEvent', () => {
  it('PUT 到 /api/events/:id 并解出更新后的条目', async () => {
    mockedPut.mockResolvedValue(jsonResponse(makeEvent({ title: '评审' })))
    const result = await updateEvent('ev1', { title: '评审' })
    expect(result.title).toBe('评审')
    expect(mockedPut).toHaveBeenCalledWith('/api/events/ev1', { json: { title: '评审' } })
  })
})

describe('deleteEvent', () => {
  it('204 时不调用 unwrap 直接返回', async () => {
    mockedDelete.mockResolvedValue({ status: 204 } as Response)
    await expect(deleteEvent('ev1')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/events/ev1')
  })
})
