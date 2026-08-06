import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { fetchAuthStatus, login, logout } from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)

function envelope(data: unknown, success = true) {
  return new Response(JSON.stringify({ success, message: 'ok', data }), {
    status: success ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('auth api', () => {
  afterEach(() => vi.clearAllMocks())

  it('login posts the token to /api/auth/login', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: true }))
    const result = await login('secret')
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/login', { json: { token: 'secret' } })
    expect(result.authenticated).toBe(true)
  })

  it('logout posts to /api/auth/logout', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: false }))
    const result = await logout()
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/logout')
    expect(result.authenticated).toBe(false)
  })

  it('fetchAuthStatus maps a 401 to authenticated:false', async () => {
    mockedGet.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: '未认证或登录已过期' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const result = await fetchAuthStatus()
    expect(result.authenticated).toBe(false)
  })

  it('fetchAuthStatus returns authenticated on 200', async () => {
    mockedGet.mockResolvedValue(envelope({ authenticated: true }))
    const result = await fetchAuthStatus()
    expect(result.authenticated).toBe(true)
  })
})
