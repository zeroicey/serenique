import { describe, expect, test } from 'bun:test'
import {
  clearSessionCookie,
  evaluateRegisterGate,
  evaluateSeedGate,
  secretsEqual,
  signSessionCookie,
  throttleIsBlocked,
  throttleRecordFailure,
  throttleShouldBlock,
  verifySessionCookie,
} from './auth.domain'

// ---------------------------------------------------------------------------
// Auth domain unit tests — cookie signing (userId 载荷), constant-time compare,
// register gate decisions, throttle state transitions. No DB / IO.
// ---------------------------------------------------------------------------

const SECRET = 'session-secret-0123456789abcdef'
const USER_ID = '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001'
const NOW = 1_800_000_000

describe('secretsEqual', () => {
  test('true for identical strings, false for any difference', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true)
    expect(secretsEqual('abc', 'abd')).toBe(false)
    expect(secretsEqual('abc', 'abc ')).toBe(false)
    expect(secretsEqual('', 'abc')).toBe(false)
  })
})

describe('session cookie (userId 载荷)', () => {
  test('sign → verify round-trip returns the userId', () => {
    const cookie = signSessionCookie(SECRET, NOW + 3600, USER_ID)
    expect(verifySessionCookie(SECRET, cookie, NOW)).toEqual({
      valid: true,
      userId: USER_ID,
    })
  })

  test('tampered userId → tampered', () => {
    const cookie = signSessionCookie(SECRET, NOW + 3600, USER_ID)
    const [exp, , sig] = cookie.split('.')
    const forged = `${exp}.0198f6d0-9e7c-71d7-8214-2a0f7f5f9999.${sig}`
    expect(verifySessionCookie(SECRET, forged, NOW)).toEqual({
      valid: false,
      reason: 'tampered',
    })
  })

  test('tampered expiry → tampered', () => {
    const cookie = signSessionCookie(SECRET, NOW + 3600, USER_ID)
    const [, uid, sig] = cookie.split('.')
    const forged = `${NOW + 7200}.${uid}.${sig}`
    expect(verifySessionCookie(SECRET, forged, NOW)).toEqual({
      valid: false,
      reason: 'tampered',
    })
  })

  test('expired cookie → expired', () => {
    const cookie = signSessionCookie(SECRET, NOW - 1, USER_ID)
    expect(verifySessionCookie(SECRET, cookie, NOW)).toEqual({
      valid: false,
      reason: 'expired',
    })
  })

  test('wrong secret → tampered', () => {
    const cookie = signSessionCookie(SECRET, NOW + 3600, USER_ID)
    expect(verifySessionCookie('another-secret-0123456789abcdef', cookie, NOW)).toEqual({
      valid: false,
      reason: 'tampered',
    })
  })

  test('malformed shapes → malformed', () => {
    // 旧格式（无 userId，2 段）也一律视为 malformed
    expect(verifySessionCookie(SECRET, '123.abc', NOW)).toEqual({
      valid: false,
      reason: 'malformed',
    })
    // 4 段
    const cookie = signSessionCookie(SECRET, NOW + 3600, USER_ID)
    expect(verifySessionCookie(SECRET, `${cookie}.extra`, NOW)).toEqual({
      valid: false,
      reason: 'malformed',
    })
    // 非整数过期
    expect(verifySessionCookie(SECRET, `abc.${USER_ID}.sig`, NOW)).toEqual({
      valid: false,
      reason: 'malformed',
    })
    // 非 UUID userId
    expect(verifySessionCookie(SECRET, `${NOW + 3600}.not-a-uuid.sig`, NOW)).toEqual({
      valid: false,
      reason: 'malformed',
    })
  })
})

describe('evaluateRegisterGate', () => {
  const setupToken = 'setup-token-0123456789abcdef'

  test('凭证 0 + 正确 setup token → first-time', () => {
    expect(
      evaluateRegisterGate({
        credentialCount: 0,
        isAuthenticated: false,
        setupToken,
        providedSetupToken: setupToken,
      }),
    ).toEqual({ kind: 'first-time' })
  })

  test('凭证 0 + 错误/缺失 setup token → rejected 403', () => {
    expect(
      evaluateRegisterGate({
        credentialCount: 0,
        isAuthenticated: false,
        setupToken,
        providedSetupToken: 'wrong',
      }),
    ).toMatchObject({ kind: 'rejected', status: 403 })
    expect(
      evaluateRegisterGate({
        credentialCount: 0,
        isAuthenticated: false,
        setupToken,
        providedSetupToken: undefined,
      }),
    ).toMatchObject({ kind: 'rejected', status: 403 })
  })

  test('凭证 0 + setup token 未配置 → rejected 500', () => {
    expect(
      evaluateRegisterGate({
        credentialCount: 0,
        isAuthenticated: false,
        setupToken: undefined,
        providedSetupToken: 'anything',
      }),
    ).toMatchObject({ kind: 'rejected', status: 500 })
  })

  test('凭证 ≥1 + 无会话 → rejected 401（加设备需登录，即使带 setup token）', () => {
    expect(
      evaluateRegisterGate({
        credentialCount: 1,
        isAuthenticated: false,
        setupToken,
        providedSetupToken: setupToken,
      }),
    ).toMatchObject({ kind: 'rejected', status: 401 })
  })

  test('凭证 ≥1 + 会话 → authenticated（添加设备）', () => {
    expect(
      evaluateRegisterGate({
        credentialCount: 1,
        isAuthenticated: true,
        setupToken,
        providedSetupToken: undefined,
      }),
    ).toEqual({ kind: 'authenticated' })
  })
})

describe('evaluateSeedGate（启动 fail-closed，决策⑨）', () => {
  test('users 空表 → 拒绝启动，指明引导脚本', () => {
    const decision = evaluateSeedGate(0)
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.message).toContain('bun scripts/bootstrap-user.ts')
      expect(decision.message).toContain('docker compose run --rm api')
    }
  })

  test('users 已有行 → 放行', () => {
    expect(evaluateSeedGate(1)).toEqual({ ok: true })
    expect(evaluateSeedGate(2)).toEqual({ ok: true })
  })
})

describe('login throttle state transitions', () => {
  test('blocked only inside window with count >= max', () => {
    expect(throttleIsBlocked(undefined, 0)).toBe(false)
    const state = throttleRecordFailure(undefined, 1000)
    expect(throttleIsBlocked(state, 2000)).toBe(true)
    expect(throttleShouldBlock(state, 2000, 5)).toBe(false) // count 1 < 5
    let s = state
    for (let i = 0; i < 4; i++) s = throttleRecordFailure(s, 2000)
    expect(throttleShouldBlock(s, 2000, 5)).toBe(true)
    expect(throttleShouldBlock(s, 2000 + 10 * 60_000, 5)).toBe(false) // 窗口过期
  })

  test('window restarts on expiry', () => {
    const s1 = throttleRecordFailure(undefined, 1000)
    const s2 = throttleRecordFailure(s1, 1000 + 11 * 60_000)
    expect(s2).toEqual({ count: 1, resetAtMs: 1000 + 11 * 60_000 + 10 * 60_000 })
  })
})

describe('cookie builders', () => {
  test('buildSessionCookie includes HttpOnly + SameSite, Secure only when requested', () => {
    const crossSite = clearSessionCookie(true, true)
    expect(crossSite).toContain('HttpOnly')
    expect(crossSite).toContain('SameSite=None')
    expect(crossSite).toContain('Secure')
    const lax = clearSessionCookie(false, false)
    expect(lax).toContain('SameSite=Lax')
    expect(lax).not.toContain('Secure')
  })

  test('跨站模式带 Partitioned（CHIPS，移动端第三方 cookie 拦截兼容），同源模式不带', () => {
    expect(clearSessionCookie(true, true)).toContain('Partitioned')
    expect(clearSessionCookie(false, false)).not.toContain('Partitioned')
  })
})
