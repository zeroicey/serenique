import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAuthStatus, fetchOidcAuthorizeUrl } from './api'

// 真实 ky 边界测试：不 mock @/api/client，stub 全局 fetch，直接走真实 ky 实例。
// client 全局 throwHttpErrors:false —— 非 2xx 必须返回 Response 交给 unwrap/手动
// status 检查，而不是被 ky 默认行为直接 reject 成 HTTPError（那样服务端文案与
// 状态码都会丢失，登录页错误提示的区分会失效）。

describe('auth api at the real ky boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('fetchAuthStatus resolves to { authenticated: false } on a real HTTP 401 instead of throwing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { success: false, message: '未认证或登录已过期' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAuthStatus()

    expect(result).toEqual({ authenticated: false, user: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetchAuthStatus resolves to { authenticated: true } on a real 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        message: 'ok',
        data: { authenticated: true, user: null },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAuthStatus()

    expect(result).toEqual({ authenticated: true, user: null })
  })

  it('fetchOidcAuthorizeUrl throws ApiError with server message on a real HTTP 503', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(503, { success: false, message: '认证未配置' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchOidcAuthorizeUrl()).rejects.toMatchObject({
      status: 503,
      message: '认证未配置',
    })
  })

  it('fetchOidcAuthorizeUrl passes through a real https authorization URL untouched', async () => {
    const target = 'https://auth.zeroicey.me/authorize?client_id=x&code_challenge=y'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { success: true, message: 'ok', data: { authorizationUrl: target } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchOidcAuthorizeUrl()
    expect(result.authorizationUrl).toBe(target)
  })

  it('network failure (fetch rejects) propagates as ky NetworkError（不吞错，由调用方 toast 兑底）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    // ky 会把底层网络错误包成自身 NetworkError（非 ApiError）；契约是「必须拒绝」
    // 而非「必须是 ApiError」，登录页 catch 分支对任意错误都能兜底。
    await expect(fetchOidcAuthorizeUrl()).rejects.toThrow()
  })
})
