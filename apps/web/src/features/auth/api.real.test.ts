import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAuthStatus } from './api'

// 真实 ky 边界测试：不 mock @/api/client，stub 全局 fetch，直接走真实 ky 实例，
// 验证 throwHttpErrors:false 在 HTTP 401 上不抛错（而非仅在 mock api.get 时成立）。
// 这堵住了「测试只 mock 了自己」的缝：ky 默认 throwHttpErrors:true，若没传
// throwHttpErrors:false，真实 401 会在 res.status 守卫前 reject。

describe('fetchAuthStatus at the real ky boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('resolves to { authenticated: false } on a real HTTP 401 instead of throwing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { success: false, message: '未认证或登录已过期' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAuthStatus()

    expect(result).toEqual({ authenticated: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves to { authenticated: true } on a real 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, message: 'ok', data: { authenticated: true } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAuthStatus()

    expect(result).toEqual({ authenticated: true })
  })

  it('still throws on a real non-401 error (preserves the error contract)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { success: false, message: '服务器错误' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAuthStatus()).rejects.toThrow('服务器错误')
  })
})
