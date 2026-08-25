import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ---------------------------------------------------------------------------
// Auth domain — pure rules: session cookie signing/verification (payload now
// carries the userId), constant-time compare, and OIDC login-state helpers
// (PKCE pair / state / nonce). No DB / IO imports.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = 'serenique_session'
// 决策④（2026-08-26）：会话有效期 30 天 → 3 天（借 OIDC 迁移收紧安全窗口）。
export const DEFAULT_SESSION_TTL_SECONDS = 3 * 24 * 3600 // 3 天
// OIDC 登录态（state → verifier/nonce）有效期：授权跳转往返通常 <1 分钟。
export const OIDC_STATE_TTL_MS = 10 * 60_000 // 10 分钟

const SESSION_PREFIX = 'serenique-session.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Constant-time string compare (mirrors blob.domain signaturesEqual). */
export function secretsEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Sign a session cookie carrying the user identity:
 * "<exp>.<userId>.<base64url(HMAC-SHA256(secret, prefix+exp.userId))>".
 * The userId is part of the signed payload, so swapping it in a cookie
 * invalidates the signature.
 */
export function signSessionCookie(secret: string, expires: number, userId: string): string {
  const sig = createHmac('sha256', secret)
    .update(`${SESSION_PREFIX}${expires}.${userId}`)
    .digest('base64url')
  return `${expires}.${userId}.${sig}`
}

export type SessionVerifyResult =
  | { valid: true; userId: string }
  | { valid: false; reason: 'malformed' | 'tampered' | 'expired' }

/** Verify a session cookie value at a given unix-second clock. */
export function verifySessionCookie(
  secret: string,
  value: string,
  nowSec: number,
): SessionVerifyResult {
  const parts = value.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed' }
  const [expStr, userId, signature] = parts
  const expires = Number(expStr)
  if (!Number.isInteger(expires) || expires <= 0 || !UUID_RE.test(userId)) {
    return { valid: false, reason: 'malformed' }
  }
  const expected = signSessionCookie(secret, expires, userId)
  const expectedSignature = expected.split('.')[2]
  if (!secretsEqual(signature, expectedSignature)) {
    return { valid: false, reason: 'tampered' }
  }
  if (expires < nowSec) return { valid: false, reason: 'expired' }
  return { valid: true, userId }
}

/**
 * Build a Set-Cookie header. crossSite=true 用于生产（serenique.0icey.icu →
 * api.hcyj.xyz）：SameSite=None + Secure 之外再加 **Partitioned**（CHIPS）——
 * 移动端 Safari/Chrome 默认拦截跨站第三方 cookie，Partitioned 让 cookie 按
 * 顶层站点（serenique.0icey.icu）分区存储，仅同顶层站点的请求携带，安全语义
 * 恰好符合单用户私有部署。dev 走 Vite 代理（同源）用 SameSite=Lax。
 * secure=false 用于 dev（http），生产必须 true（https）。
 */
export function buildSessionCookie(
  value: string,
  maxAgeSeconds: number,
  crossSite: boolean,
  secure: boolean,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    crossSite ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) parts.push('Secure')
  if (crossSite) parts.push('Partitioned')
  return parts.join('; ')
}

export function clearSessionCookie(crossSite: boolean, secure: boolean): string {
  return buildSessionCookie('', 0, crossSite, secure)
}

// ---- OIDC login-state helpers（纯函数，无 DB/IO）---------------------------
// 授权码 + PKCE 流程的登录态生成：state 防 CSRF，nonce 绑定 ID Token，
// verifier/challenge 为 S256 PKCE 对。服务端 Map 按 state 存放，一次性消费。

/** URL-safe random token（base64url），用于 state / nonce / PKCE verifier。 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** S256 PKCE 对：challenge = base64url(SHA256(verifier))。RFC 7636 §4.2。 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
