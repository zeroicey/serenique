import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  clearSessionCookie,
  createPkcePair,
  randomToken,
  secretsEqual,
  signSessionCookie,
  verifySessionCookie,
} from './auth.domain'

// ---------------------------------------------------------------------------
// Auth domain unit tests — cookie signing (userId 载荷), constant-time compare,
// OIDC login-state helpers（PKCE 对 / 随机 token）。No DB / IO.
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

describe('OIDC login-state helpers', () => {
  test('randomToken: base64url、长度随字节数、不重复', () => {
    const a = randomToken(32)
    const b = randomToken(32)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a).not.toBe(b)
    expect(randomToken(16).length).toBeLessThan(a.length)
  })

  test('createPkcePair: challenge = base64url(SHA256(verifier))（RFC 7636 S256）', () => {
    const { verifier, challenge } = createPkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    // 与独立重算结果一致；不同 verifier/challenge 必须不同。
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
    const other = createPkcePair()
    expect(other.verifier).not.toBe(verifier)
    expect(other.challenge).not.toBe(challenge)
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
