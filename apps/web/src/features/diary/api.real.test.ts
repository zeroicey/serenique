import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDiaryByDate } from './api'

// 真实 ky 边界测试：不 mock @/api/client，stub 全局 fetch，直接走真实 ky 实例，
// 验证 throwHttpErrors:false 在 HTTP 404 上返回响应而非抛错——即「当天无日记 → null」
// 的转换真的发生在 ky 边界，而不是仅在一个 mock 掉的 api.get 上成立。
// 这堵住了「测试只 mock 了自己」的缝：ky 默认 throwHttpErrors:true，若 getDiaryByDate
// 没传 throwHttpErrors:false，真实 404 会在 res.status 守卫前 reject，从而触发
// TanStack Query 的 retry 风暴。

describe('getDiaryByDate at the real ky boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('404 → resolves to null (today not exists) without throwing or retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { success: false, message: '日记不存在' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getDiaryByDate('2026-08-05')

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('200 → resolves the diary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        message: 'ok',
        data: { id: 'd1', diaryDate: '2026-08-05', content: '今天', createdAt: 'x', updatedAt: 'x' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getDiaryByDate('2026-08-05')

    expect(result?.id).toBe('d1')
    expect(result?.diaryDate).toBe('2026-08-05')
  })

  it('500 → still rejects (preserves the error contract)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { success: false, message: '服务器错误' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getDiaryByDate('2026-08-05')).rejects.toThrow('服务器错误')
  })
})
