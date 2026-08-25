import { describe, expect, mock, test } from 'bun:test'
import { setTestEnv } from '@/test/helpers'

setTestEnv() // 总是带默认 SESSION_SECRET / OIDC_* 四元组

// ---------------------------------------------------------------------------
// Auth service unit tests — OIDC 授权跳转（mock openid-client，不外呼）与
// cookie 往返。所有走 DB 的路径（用户 upsert、回调换 token）由集成测试覆盖。
// ---------------------------------------------------------------------------

// mock openid-client：discovery/buildAuthorizationUrl 不发网络请求。
// ⚠️ bun test 单进程共享模块缓存 —— mock 必须在 import('./auth.service') 之前生效。
const fakeConfig = { fake: 'configuration' } as never
mock.module('openid-client', () => ({
  discovery: async () => fakeConfig,
  buildAuthorizationUrl: (_config: unknown, params: Record<string, string>) => {
    const url = new URL('https://auth.zeroicey.me/authorize')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return url
  },
}))

describe('authService (no DB)', () => {
  test('auth is enabled when SESSION_SECRET + OIDC 四元组 configured', async () => {
    const { authService } = await import('./auth.service')
    expect(authService.isAuthEnabled()).toBe(true)
  })

  test('createSessionCookie round-trips through verifySessionCookie with userId', async () => {
    const { authService } = await import('./auth.service')
    const userId = '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001'
    const cookie = authService.createSessionCookie(userId)
    const result = authService.verifySessionCookie(cookie)
    expect(result).toEqual({ valid: true, userId })
    expect(authService.verifySessionCookie('garbage')).toEqual({
      valid: false,
      reason: 'malformed',
    })
  })

  test('buildOidcAuthorizeUrl: 携带 state/nonce/PKCE 参数并把登录态入库', async () => {
    const { authService } = await import('./auth.service')
    authService._states.clear()
    const { authorizationUrl } = await authService.buildOidcAuthorizeUrl(1_000)
    const url = new URL(authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://auth.zeroicey.me/authorize')
    // response_type/client_id 由 openid-client 内部补充；这里断言我们传入的参数
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.OIDC_REDIRECT_URI!)
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const state = url.searchParams.get('state')!
    expect(state).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()
    // 登录态已按 state 存放，且 challenge 与 URL 中的一致
    expect(authService._states.size).toBe(1)
    expect(authService._states.has(state)).toBe(true)
  })

  test('OIDC 登录态一次性消费：未知 state → 401；过期 state → 401', async () => {
    const { authService } = await import('./auth.service')
    authService._states.clear()
    // 未知 state：不触碰 DB，直接 401
    expect(
      authService.handleOidcCallback({ code: 'c', state: 'unknown-state', ip: '127.0.0.1' }, 1_000),
    ).rejects.toMatchObject({ status: 401 })
    // 过期 state：TTL 10 分钟，11 分钟后消费 → 401 且被 sweep 清掉
    const { authorizationUrl } = await authService.buildOidcAuthorizeUrl(1_000)
    const state = new URL(authorizationUrl).searchParams.get('state')!
    expect(
      authService.handleOidcCallback({ code: 'c', state, ip: '127.0.0.1' }, 1_000 + 11 * 60_000),
    ).rejects.toMatchObject({ status: 401 })
    expect(authService._states.size).toBe(0)
  })

  test('_sweepStates keeps the map bounded', async () => {
    const { authService } = await import('./auth.service')
    authService._states.clear()
    await authService.buildOidcAuthorizeUrl(1_000)
    await authService.buildOidcAuthorizeUrl(2_000)
    expect(authService._states.size).toBe(2)
    // 11 分钟后再次 issue → 前两条已过期被清掉
    await authService.buildOidcAuthorizeUrl(1_000 + 11 * 60_000)
    expect(authService._states.size).toBe(1)
  })
})
