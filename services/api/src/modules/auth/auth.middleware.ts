import type { Context, Next } from 'hono'
import { auditService } from '@/modules/audit/audit.service'
import { tokenService } from '@/modules/tokens/token.service'
import { AppError, ErrorCode } from '@/shared/errors'
import { clientIp } from '@/shared/ip'
import { Res } from '@/shared/response'
import { SESSION_COOKIE_NAME } from './auth.domain'
import { authService } from './auth.service'

// ---------------------------------------------------------------------------
// Auth middleware — the gate for every /api/* route.
//
// 身份来源二选一：
//   ① HttpOnly 会话 Cookie（验签 → 解析 userId，会话身份）
//   ② Authorization: Bearer <API Token>（查 api_tokens 表，令牌身份，无 userId）
// 放行：OIDC 登录端点、登出、签名 blob 链接（交给 blob handler 自行校验）。
// dev 未配置 OIDC_* 时整体跳过（本地零摩擦）。
// ---------------------------------------------------------------------------

const BLOB_FILE_ROUTE = /^\/api\/blobs\/[^/]+\/file$/

// 无需认证即可到达的路径（OIDC 登录态由 service 层一次性消费把关）。
const PUBLIC_ROUTES = new Set(['/api/auth/oidc/url', '/api/auth/oidc/callback', '/api/auth/logout'])

export type AuthVars = {
  userId: string | null // 会话身份才携带；token 身份为 null
  authSource: 'session' | 'token' | null
  tokenId: string | null
}

const EMPTY_AUTH: AuthVars = { userId: null, authSource: null, tokenId: null }

/** 读取中间件写入的认证信息（c.set("auth", ...)）。 */
export function getAuthVars(c: Context): AuthVars {
  return (c.get('auth') ?? EMPTY_AUTH) as AuthVars
}

/** 需要「用户身份」的端点（users/me、凭证管理）必须走会话登录。 */
export function requireSessionUser(c: Context): string {
  const { userId } = getAuthVars(c)
  if (!userId) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '请先登录后再操作', 401)
  }
  return userId
}

function isSignedBlobLink(c: Context): boolean {
  const q = c.req.query()
  return BLOB_FILE_ROUTE.test(c.req.path) && Boolean(q.expires && q.signature)
}

/**
 * 尽力解析身份（Bearer / 会话 cookie），失败返回 null。
 * 公开路由也会调用：无凭据时照常放行（OIDC 登录态在 service 层把关）。
 */
async function resolveAuth(c: Context): Promise<AuthVars | null> {
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim()
    if (token) {
      const row = await tokenService.verify(token)
      if (row) {
        return { userId: null, authSource: 'token', tokenId: row.id }
      }
    }
    return null
  }

  const rawCookie = c.req.header('Cookie') ?? ''
  const m = rawCookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`))
  const value = m?.[1]
  if (value) {
    const result = authService.verifySessionCookie(value)
    if (result.valid) {
      return { userId: result.userId, authSource: 'session', tokenId: null }
    }
  }
  return null
}

export async function authMiddleware(c: Context, next: Next) {
  if (!authService.isAuthEnabled()) return next()

  const isPublic = PUBLIC_ROUTES.has(c.req.path) || isSignedBlobLink(c)
  const vars = await resolveAuth(c)
  if (vars) c.set('auth', vars)
  if (isPublic) return next()

  if (!vars) {
    auditService.recordUnauthorized(clientIp(c))
    return Res.unauthorized('未认证或登录已过期').build(c)
  }
  return next()
}
