import type { Context } from 'hono'
import { env } from '@/env'
import { fireAuditRecord } from '@/modules/audit/audit.service'
import { buildSessionCookie, clearSessionCookie } from '@/modules/auth/auth.domain'
import { getAuthVars, requireSessionUser } from '@/modules/auth/auth.middleware'
import { authService } from '@/modules/auth/auth.service'
import { OidcCallbackSchema, UpdateUserProfileSchema } from '@/modules/auth/auth.types'
import { handleError } from '@/shared/handler'
import { clientIp } from '@/shared/ip'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Auth handlers — parse request → call service → build response.
// Set-Cookie 统一在这里拼装（crossSite/secure 由 NODE_ENV 决定）。
// ---------------------------------------------------------------------------

function buildSetCookie(c: Context, userId: string): void {
  const crossSite = env.NODE_ENV === 'production'
  const secure = env.NODE_ENV !== 'development'
  c.header(
    'Set-Cookie',
    buildSessionCookie(
      authService.createSessionCookie(userId),
      authService.sessionTtlSeconds(),
      crossSite,
      secure,
    ),
  )
}

function clearCookie(c: Context): void {
  const crossSite = env.NODE_ENV === 'production'
  const secure = env.NODE_ENV !== 'development'
  c.header('Set-Cookie', clearSessionCookie(crossSite, secure))
}

export const authHandler = {
  // ---- OIDC 登录（Pocket ID 授权码 + PKCE）---------------------------------

  /** 生成认证中心授权跳转 URL（含 state/nonce/PKCE，登录态存服务端）。 */
  async oidcAuthorize(c: Context) {
    try {
      if (!authService.isAuthEnabled()) {
        return Res.error('认证未配置').status(503).code('AUTH_DISABLED').build(c)
      }
      const result = await authService.buildOidcAuthorizeUrl()
      return Res.ok('获取授权地址成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'auth')
    }
  },

  /** 回调：code+state 换 token（服务端持 secret）→ 验签 → 建会话。 */
  async oidcCallback(c: Context) {
    try {
      const body = OidcCallbackSchema.parse(await c.req.json())
      const user = await authService.handleOidcCallback({ ...body, ip: clientIp(c) })
      buildSetCookie(c, user.id)
      return Res.ok('登录成功', { authenticated: true, user }).build(c)
    } catch (e) {
      return handleError(e, c, 'auth')
    }
  },

  async logout(c: Context) {
    clearCookie(c)
    fireAuditRecord({
      event: 'auth.logout',
      message: '退出登录',
      level: 'info',
      ip: clientIp(c),
    })
    return Res.ok('已退出登录', { authenticated: false }).build(c)
  },

  /**
   * 会话状态 + 用户信息。认证禁用/未登录 → authenticated:false；
   * 令牌身份（已通过中间件认证）→ authenticated:true + 单用户资料（未注册时为 null）。
   */
  async me(c: Context) {
    try {
      const { userId, authSource } = getAuthVars(c)
      if (!userId && authSource !== 'token') {
        return Res.ok('查询成功', { authenticated: false, user: null }).build(c)
      }
      const user = userId ? await authService.getProfile(userId) : await authService.getFirstUser()
      return Res.ok('查询成功', { authenticated: true, user }).build(c)
    } catch (e) {
      return handleError(e, c, 'auth')
    }
  },

  // ---- 个人信息（需登录会话）------------------------------------------------

  async getProfile(c: Context) {
    try {
      const userId = requireSessionUser(c)
      const user = await authService.getProfile(userId)
      return Res.ok('查询成功', user).build(c)
    } catch (e) {
      return handleError(e, c, 'auth')
    }
  },

  async updateProfile(c: Context) {
    try {
      const userId = requireSessionUser(c)
      const body = UpdateUserProfileSchema.parse(await c.req.json())
      const user = await authService.updateProfile(userId, body)
      return Res.ok('个人信息已更新', user).build(c)
    } catch (e) {
      return handleError(e, c, 'auth')
    }
  },
}
