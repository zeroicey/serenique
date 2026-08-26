import { and, asc, eq, isNull } from 'drizzle-orm'
import type * as oidc from 'openid-client'
import * as openidClient from 'openid-client'
import { db } from '@/db/connection'
import { env } from '@/env'
import { fireAuditRecord } from '@/modules/audit/audit.service'
import {
  createPkcePair,
  DEFAULT_SESSION_TTL_SECONDS,
  OIDC_STATE_TTL_MS,
  randomToken,
  type SessionVerifyResult,
  signSessionCookie,
  verifySessionCookie,
} from '@/modules/auth/auth.domain'
import { toUserEntry } from '@/modules/auth/auth.mappers'
import { users } from '@/modules/auth/auth.schema'
import type { OidcIdentity, UpdateUserProfileInput, UserEntry } from '@/modules/auth/auth.types'
import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Auth service — Pocket ID OIDC login (authorization code + PKCE) + stateless
// session cookies + user profile management, orchestrated over `db`.
//
// 登录态（state → verifier/nonce）存单进程内存 Map，10 分钟 TTL，一次性消费。
// Session cookie: HMAC-signed with SESSION_SECRET, payload carries userId.
// token 交换与 ID Token 验签全部委托 openid-client（discovery + JWKS 自动处理）。
// ---------------------------------------------------------------------------

type OidcLoginState = {
  verifier: string
  nonce: string
  expiresAt: number
  /** 本次授权请求实际使用的 redirect_uri（web 域名回调或移动端自定义 scheme），
   *  token 交换时必须与授权请求严格一致（OAuth 规范要求）。 */
  redirectUri: string
}

export const authService = {
  /** OIDC 未配置（dev）时认证整体跳过；五项齐备才算启用。 */
  isAuthEnabled(): boolean {
    return Boolean(
      env.SESSION_SECRET &&
        env.OIDC_ISSUER &&
        env.OIDC_CLIENT_ID &&
        env.OIDC_CLIENT_SECRET &&
        env.OIDC_REDIRECT_URI,
    )
  },

  sessionTtlSeconds(): number {
    return env.SESSION_TTL ?? DEFAULT_SESSION_TTL_SECONDS
  },

  // ---- Session cookie（载荷携带 userId）------------------------------------

  createSessionCookie(userId: string): string {
    const expires = Math.floor(Date.now() / 1000) + this.sessionTtlSeconds()
    return signSessionCookie(env.SESSION_SECRET!, expires, userId)
  },

  verifySessionCookie(value: string): SessionVerifyResult {
    if (!this.isAuthEnabled()) return { valid: true, userId: '' }
    return verifySessionCookie(env.SESSION_SECRET!, value, Math.floor(Date.now() / 1000))
  },

  // ---- OIDC client discovery（进程内缓存单例）------------------------------

  _clientPromise: null as Promise<oidc.Configuration> | null,

  /** 懒加载并缓存 OIDC 发现文档客户端；认证未配置时调用方已先行拦截。 */
  _client(): Promise<oidc.Configuration> {
    this._clientPromise ??= this._discover()
    return this._clientPromise
  },

  async _discover(): Promise<oidc.Configuration> {
    let issuerUrl: URL
    try {
      issuerUrl = new URL(env.OIDC_ISSUER ?? '')
    } catch {
      throw new AppError(ErrorCode.INTERNAL, 'OIDC_ISSUER 配置无效，无法启用认证', 500)
    }
    return openidClient.discovery(issuerUrl, env.OIDC_CLIENT_ID!, env.OIDC_CLIENT_SECRET!)
  },

  // ---- OIDC 登录态 store（单进程内存，一次性消费）--------------------------

  _states: new Map<string, OidcLoginState>(),

  _sweepStates(nowMs = Date.now()): void {
    for (const [key, rec] of this._states) {
      if (nowMs >= rec.expiresAt) this._states.delete(key)
    }
  },

  /**
   * 生成授权跳转 URL：state 随机 + S256 PKCE 对 + nonce，登录态按 state 入库。
   * target=mobile 使用自定义 scheme 回调（需配置 OIDC_MOBILE_REDIRECT_URI），
   * 默认 web 走 OIDC_REDIRECT_URI。返回的 authorizationUrl 由客户端整页/浏览器打开。
   */
  async buildOidcAuthorizeUrl(
    target: 'web' | 'mobile' = 'web',
    nowMs = Date.now(),
  ): Promise<{ authorizationUrl: string }> {
    const client = await this._client()
    this._sweepStates(nowMs)
    if (target === 'mobile' && !env.OIDC_MOBILE_REDIRECT_URI) {
      throw new AppError(ErrorCode.VALIDATION, '移动端登录未配置（缺 OIDC_MOBILE_REDIRECT_URI）', 503)
    }
    const redirectUri =
      target === 'mobile' ? env.OIDC_MOBILE_REDIRECT_URI! : env.OIDC_REDIRECT_URI!
    const state = randomToken(32)
    const nonce = randomToken(32)
    const { verifier, challenge } = createPkcePair()
    this._states.set(state, {
      verifier,
      nonce,
      expiresAt: nowMs + OIDC_STATE_TTL_MS,
      redirectUri,
    })

    const authorizationUrl = openidClient.buildAuthorizationUrl(client, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    return { authorizationUrl: authorizationUrl.href }
  },

  /**
   * 完成回调：一次性消费 state → code+verifier 换 token → 校验 nonce →
   * 取 sub/email/name 映射（或创建）本地用户。任何失败都抛 401，
   * 不区分「state 无效」与「code 已用过」（避免探测面）。
   *
   * input.query 是认证中心回跳的完整查询串（code/state/iss…）：RFC 9207
   * 支持 iss 参数的 IdP（如 Pocket ID）必须原样透传全部参数，否则
   * openid-client 在发 token 请求前就判非法响应。
   */
  async handleOidcCallback(
    input: { query: string; ip: string },
    nowMs = Date.now(),
  ): Promise<UserEntry> {
    const raw = input.query.startsWith('?') ? input.query.slice(1) : input.query
    const params = new URLSearchParams(raw)
    const state = params.get('state') ?? ''
    const record = state ? this._states.get(state) : undefined
    this._sweepStates(nowMs)
    if (!state || !record || nowMs >= record.expiresAt) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态无效或已过期，请重新登录', 401)
    }
    // 先删后用：同一 state 只允许成功一次（重放直接落空）。
    this._states.delete(state)

    // OIDC 验证段（换 token + ID Token 校验）：任何失败都归为 401 并记审计，
    // 不区分 state 无效与 code 已用过（避免探测面）。
    let identity: OidcIdentity
    try {
      const client = await this._client()
      // 回跳 URL 用登录态里记录的 redirect_uri（与授权请求严格一致，可能是
      // web 域名或移动端自定义 scheme）+ 原样透传的查询参数。
      const currentUrl = new URL(`${record.redirectUri}?${params.toString()}`)
      const tokens = await openidClient.authorizationCodeGrant(client, currentUrl, {
        pkceCodeVerifier: record.verifier,
        expectedState: state,
        expectedNonce: record.nonce,
      })
      const claims = tokens.claims()
      if (!claims?.sub) throw new Error('missing sub claim')
      identity = {
        sub: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
        name: typeof claims.name === 'string' ? claims.name : null,
      }
    } catch (e) {
      fireAuditRecord({
        event: 'auth.login_failed',
        message: 'OIDC 回调验证失败',
        level: 'warn',
        ip: input.ip,
        detail: { error: (e as Error).message },
      })
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录验证失败，请重新登录', 401)
    }

    // 用户落库段在 OIDC 验证 try 之外：DB 故障保持原始 500 语义（review F1），
    // 不被吞成「登录失败」误导运维信号。
    const userRow = await this.upsertOidcUser(identity)
    fireAuditRecord({
      event: 'auth.login',
      message: '登录成功（Pocket ID）',
      level: 'info',
      ip: input.ip,
      detail: { userId: userRow.id },
    })
    return toUserEntry(userRow)
  },

  /**
   * sub → 本地用户行：先按 oidcSub 精确匹配；未绑定过则绑到现有唯一用户行
   * （决策②：个人信息不丢、审计不断档）；无现有行才新建（未来多用户语义）。
   * 并发双击回调撞 unique 冲突时按 oidcSub 重查一次兜底。
   */
  async upsertOidcUser(identity: OidcIdentity): Promise<typeof users.$inferSelect> {
    const [bound] = await db.select().from(users).where(eq(users.oidcSub, identity.sub))
    if (bound) return bound

    const [first] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1)
    if (first && !first.oidcSub) {
      const [updated] = await db
        .update(users)
        .set({
          oidcSub: identity.sub,
          name: first.name ?? identity.name,
          email: first.email ?? identity.email,
        })
        .where(and(eq(users.id, first.id), isNull(users.oidcSub)))
        .returning()
      if (updated) return updated
    }

    const [created] = await db
      .insert(users)
      .values({ oidcSub: identity.sub, name: identity.name, email: identity.email })
      .onConflictDoNothing({ target: users.oidcSub })
      .returning()
    if (created) return created
    const [raced] = await db.select().from(users).where(eq(users.oidcSub, identity.sub))
    if (!raced) throw new AppError(ErrorCode.INTERNAL, '用户绑定失败', 500)
    return raced
  },

  // ---- 用户资料 ------------------------------------------------------------

  async getProfile(userId: string): Promise<UserEntry> {
    const [row] = await db.select().from(users).where(eq(users.id, userId))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '用户不存在', 404)
    return toUserEntry(row)
  },

  /** 取唯一用户（单用户系统）；尚未注册时返回 null。令牌身份的 me 用。 */
  async getFirstUser(): Promise<UserEntry | null> {
    const [row] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1)
    return row ? toUserEntry(row) : null
  },

  async updateProfile(userId: string, patch: UpdateUserProfileInput): Promise<UserEntry> {
    const [row] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '用户不存在', 404)
    return toUserEntry(row)
  },
}
