import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { deleteCredential, registerStart } from './api'
import { fetchAuthStatus } from './api'

// 真实 ky 边界测试：不 mock @/api/client，stub 全局 fetch，直接走真实 ky 实例。
// client 全局 throwHttpErrors:false —— 非 2xx 必须返回 Response 交给 unwrap/手动
// status 检查，而不是被 ky 默认行为直接 reject 成 HTTPError（那样服务端文案与
// 状态码都会丢失，/setup 页 403/401/500 的区分会失效）。

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
      jsonResponse(200, { success: true, message: 'ok', data: { authenticated: true } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAuthStatus()

    expect(result).toEqual({ authenticated: true })
  })

  it('fetchAuthStatus still throws on a real non-401 error (preserves the error contract)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { success: false, message: '服务器错误' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAuthStatus()).rejects.toThrow('服务器错误')
  })

  it('deleteCredential resolves on a real 204 with no body (skips json parsing)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteCredential('c1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('registerStart 真实 403 → ApiError（服务端中文文案 + status 透传，/setup 页区分错误依赖它）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, { success: false, message: '引导注册令牌不正确', code: 'FORBIDDEN' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const err = await registerStart({ setupToken: 'wrong' }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).message).toBe('引导注册令牌不正确')
  })

  it('registerStart 真实 401（已有凭证未登录）→ ApiError status 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { success: false, message: '请先登录后再添加新的登录凭证' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const err = await registerStart({}).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).message).toBe('请先登录后再添加新的登录凭证')
  })

  it('registerStart 非 JSON 网关错误（502）→ 统一中文文案', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)

    const err = await registerStart({ setupToken: 'tok' }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toBe('服务暂时不可用，请稍后再试')
  })
})
