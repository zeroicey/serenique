import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/browser'
import { api } from '@/api/client'
import {
  deleteCredential,
  fetchAuthStatus,
  listCredentials,
  loginFinish,
  loginStart,
  logout,
  registerFinish,
  registerStart,
  updateProfile,
} from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)
const mockedPut = vi.mocked(api.put)
const mockedDelete = vi.mocked(api.delete)

function envelope(data: unknown, success = true) {
  return new Response(JSON.stringify({ success, message: 'ok', data }), {
    status: success ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

const user = { id: 'u1', name: '测试', email: null, birthday: null, createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-09T00:00:00Z' }

const registrationCredential: RegistrationResponseJSON = {
  id: 'cred-1',
  rawId: 'cred-1',
  type: 'public-key',
  response: { clientDataJSON: 'aaa', attestationObject: 'bbb' },
  clientExtensionResults: {},
}

const authenticationCredential: AuthenticationResponseJSON = {
  id: 'cred-1',
  rawId: 'cred-1',
  type: 'public-key',
  response: { clientDataJSON: 'aaa', authenticatorData: 'bbb', signature: 'ccc' },
  clientExtensionResults: {},
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
    expect(mockedGet).toHaveBeenCalledWith('/api/auth/me', { throwHttpErrors: false })
    expect(result).toEqual({ authenticated: false, user: null })
  })

  it('fetchAuthStatus returns authenticated + user on 200', async () => {
    mockedGet.mockResolvedValue(envelope({ authenticated: true, user }))
    const result = await fetchAuthStatus()
    expect(result).toEqual({ authenticated: true, user })
  })

  it('registerStart posts setupToken + userInfo', async () => {
    mockedPost.mockResolvedValue(
      envelope({ challengeId: 'c1', options: { challenge: 'x', rp: { name: 'Serenique' }, user: { id: 'u', name: 'n' }, pubKeyCredParams: [], timeout: 60000 } }),
    )
    const result = await registerStart({ setupToken: 'tok', userInfo: { name: '测试' } })
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/register/start', {
      json: { setupToken: 'tok', userInfo: { name: '测试' } },
    })
    expect(result.challengeId).toBe('c1')
  })

  it('registerFinish posts challengeId + credential', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: true, user }))
    const result = await registerFinish({ challengeId: 'c1', credential: registrationCredential })
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/register/finish', {
      json: { challengeId: 'c1', credential: registrationCredential },
    })
    expect(result.authenticated).toBe(true)
  })

  it('loginStart posts to /api/auth/login/start', async () => {
    mockedPost.mockResolvedValue(envelope({ challengeId: 'c1', options: { challenge: 'x', rpId: 'localhost' } }))
    const result = await loginStart()
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/login/start')
    expect(result.challengeId).toBe('c1')
  })

  it('loginFinish posts challengeId + credential', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: true, user }))
    const result = await loginFinish({ challengeId: 'c1', credential: authenticationCredential })
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/login/finish', {
      json: { challengeId: 'c1', credential: authenticationCredential },
    })
    expect(result.authenticated).toBe(true)
  })

  it('logout posts to /api/auth/logout', async () => {
    mockedPost.mockResolvedValue(envelope({ authenticated: false }))
    const result = await logout()
    expect(mockedPost).toHaveBeenCalledWith('/api/auth/logout')
    expect(result.authenticated).toBe(false)
  })

  it('listCredentials unwraps items', async () => {
    const cred = { id: 'c1', credentialId: 'cid', deviceLabel: 'MacBook', transports: null, counter: 1, lastUsedAt: null, createdAt: '2026-08-09T00:00:00Z' }
    mockedGet.mockResolvedValue(envelope({ items: [cred] }))
    const result = await listCredentials()
    expect(mockedGet).toHaveBeenCalledWith('/api/auth/credentials')
    expect(result).toEqual([cred])
  })

  it('deleteCredential returns without parsing body on 204', async () => {
    mockedDelete.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteCredential('c1')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/auth/credentials/c1')
  })

  it('deleteCredential throws ApiError on non-204 (e.g. 409 last credential)', async () => {
    mockedDelete.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: '至少需要保留一把登录凭证' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(deleteCredential('c1')).rejects.toThrow('至少需要保留一把登录凭证')
  })

  it('updateProfile puts the profile fields', async () => {
    mockedPut.mockResolvedValue(envelope(user))
    const result = await updateProfile({ name: '测试', email: '', birthday: '' })
    expect(mockedPut).toHaveBeenCalledWith('/api/users/me', {
      json: { name: '测试', email: '', birthday: '' },
    })
    expect(result.id).toBe('u1')
  })
})
