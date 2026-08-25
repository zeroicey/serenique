import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import {
  fetchAuthStatus,
  fetchOidcAuthorizeUrl,
  logout,
  postOidcCallback,
  updateProfile,
} from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)
const mockedPut = vi.mocked(api.put)

function envelope(data: unknown, success = true) {
  return new Response(JSON.stringify({ success, message: 'ok', data }), {
    status: success ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

const user = {
  id: 'u1',
  name: '测试',
  email: null,
  birthday: null,
  createdAt: '2026-08-09T00:00:00Z',
  updatedAt: '2026-08-09T00:00:00Z',
}

describe('auth api', () => {
  afterEach(() => vi.clearAllMocks())

  it('fetchAuthStatus maps a 401 to authenticated:false', async () => {
    mockedGet.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: '未认证或登录已过期' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const result = await fetchAuthStatus()
    expect(mockedGet).toHaveBeenCalledWith('/api/auth/me')
    expect(result).toEqual({ authenticated: false, user: null })
  })

  it('fetchAuthStatus returns authenticated + user on 200', async () => {
    mockedGet.mockResolvedValue(envelope({ authenticated: true, user }))
    const result = await fetchAuthStatus()
    expect(result).toEqual({ authenticated: true, user })
  })

  it('fetchOidcAuthorizeUrl GETs /auth/oidc/url 并透传 authorizationUrl', async () => {
    mockedGet.mockResolvedValue(
      envelope({ authorizationUrl: 'https://auth.zeroicey.me/authorize?client_id=x' }),
    )
    const result = await fetchOidcAuthorizeUrl()
    expect(mockedGet).toHaveBeenCalledWith('/api/auth/oidc/url')
    expect(result.authorizationUrl).toContain('client_id=x')
  })

  it('fetchOidcAuthorizeUrl 拒绝非 http(s) 协议（纵深防御，不跳转）', async () => {
    mockedGet.mockResolvedValue(envelope({ authorizationUrl: 'javascript:alert(1)' }))
    // 同一 promise 断言两次：避免二次调用复用已消费的 Response body。
    const pending = fetchOidcAuthorizeUrl()
    await expect(pending).rejects.toThrow(ApiError)
    await expect(pending).rejects.toMatchObject({ status: 502 })
  })

  it('fetchOidcAuthorizeUrl 拒绝非法 URL 字符串', async () => {
    mockedGet.mockResolvedValue(envelope({ authorizationUrl: '::not a url::' }))
    await expect(fetchOidcAuthorizeUrl()).rejects.toBeInstanceOf(ApiError)
  })

  it('postOidcCallback 提交 code+state 到 /auth/oidc/callback', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: true, user }))
    const result = await postOidcCallback({ code: 'abc', state: 'st1' })
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/oidc/callback', {
      json: { code: 'abc', state: 'st1' },
    })
    expect(result.authenticated).toBe(true)
  })

  it('postOidcCallback 非 2xx envelope → 抛 ApiError（带服务端文案与 status）', async () => {
    mockedPost.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: '登录验证失败，请重新登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(postOidcCallback({ code: 'x', state: 'y' })).rejects.toMatchObject({
      status: 401,
      message: '登录验证失败，请重新登录',
    })
  })

  it('logout posts /auth/logout', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: false }))
    const result = await logout()
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/logout')
    expect(result.authenticated).toBe(false)
  })

  it('updateProfile PUTs partial payload to users/me', async () => {
    mockedPut.mockResolvedValue(envelope(user))
    await updateProfile({ name: '新名字' })
    expect(mockedPut).toHaveBeenCalledWith('/api/users/me', { json: { name: '新名字' } })
  })

  it('updateProfile 空 payload 也原样提交（服务端校验兜底）', async () => {
    mockedPut.mockResolvedValue(envelope(user))
    await updateProfile({})
    expect(mockedPut).toHaveBeenCalledWith('/api/users/me', { json: {} })
  })
})
