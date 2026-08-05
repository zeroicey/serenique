import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { deleteDiary, getDiaryByDate } from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedDelete = vi.mocked(api.delete)

function envelope(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response
}

afterEach(() => vi.clearAllMocks())

describe('getDiaryByDate', () => {
  it('404 → null（当天无日记）', async () => {
    mockedGet.mockResolvedValueOnce(envelope(404, { success: false, message: '日记不存在' }))
    await expect(getDiaryByDate('2026-08-05')).resolves.toBeNull()
  })

  it('命中 → 返回日记', async () => {
    mockedGet.mockResolvedValueOnce(
      envelope(200, {
        success: true,
        message: 'ok',
        data: { id: 'd1', diaryDate: '2026-08-05', content: '今天' },
      }),
    )
    const r = await getDiaryByDate('2026-08-05')
    expect(r?.id).toBe('d1')
  })

  it('非 404 错误 → 上抛 ApiError', async () => {
    mockedGet.mockResolvedValueOnce(envelope(500, { success: false, message: '服务器错误' }))
    await expect(getDiaryByDate('2026-08-05')).rejects.toThrow(ApiError)
  })
})

describe('deleteDiary', () => {
  it('204 → 直接返回', async () => {
    mockedDelete.mockResolvedValueOnce({ status: 204 } as Response)
    await expect(deleteDiary('d1')).resolves.toBeUndefined()
  })
})
