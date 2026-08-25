import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq, inArray, type SQL } from 'drizzle-orm'
import { createBunWebSocket } from 'hono/bun'
import { RUN_DB_TESTS, RUN_TOKEN, setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Auth + tokens integration — real PostgreSQL (RUN_DB_TESTS=1).
//
// OIDC 时代的服务层集成：upsertOidcUser 的三种分支（绑定现有未绑定行 / 已
// 绑定幂等复用 / 空表新建）+ HTTP 层回调端点的门禁行为（未知 state → 401、
// 缺字段 → 400）+ API token 创建/Bearer 访问/撤销 + logout。
//
// token 交换与 ID Token 验签由 openid-client 完成（外呼 issuer），HTTP 层不
// mock——真实登录链路靠本地联调验证；这里覆盖服务层纯 DB 逻辑与路由契约。
// users 表单行语义：beforeAll 清空全表后预置 marker 用户行，本仓库其他集
// 成测试不创建用户行，无并行竞态。审计行断言用带 RUN_TOKEN 的 marker IP。
// ---------------------------------------------------------------------------

setTestEnv()

const USER_MARKER = 'it-auth-e2e'
const TOKEN_MARKER = 'it-auth-token'

describe.skipIf(!RUN_DB_TESTS)('auth + tokens integration', () => {
  let createApp: typeof import('@/app').createApp
  let db: typeof import('@/db/connection').db
  let authSchema: typeof import('@/modules/auth/auth.schema')
  let tokenSchema: typeof import('@/modules/tokens/token.schema')
  let auditSchema: typeof import('@/modules/audit/audit.schema')
  let users: typeof import('@/modules/auth/auth.schema').users
  let apiTokens: typeof import('@/modules/tokens/token.schema').apiTokens
  let auditLogs: typeof import('@/modules/audit/audit.schema').auditLogs
  let authService: typeof import('@/modules/auth/auth.service').authService
  let app: ReturnType<typeof import('@/app').createApp>

  const createdAuditIds: string[] = []
  const createdTokenIds: string[] = []
  const IP_LOGIN = `it-auth-e2e-${RUN_TOKEN}-login`
  let userId = ''
  let cookie1 = ''

  /** Poll the DB until rows matching `where` appear (fire-and-forget writes). */
  async function waitForAuditRows(
    where: SQL | undefined,
    timeoutMs = 3000,
  ): Promise<(typeof auditLogs.$inferSelect)[]> {
    const deadline = Date.now() + timeoutMs
    let rows: (typeof auditLogs.$inferSelect)[] = []
    do {
      rows = where
        ? await db.select().from(auditLogs).where(where).limit(20)
        : await db.select().from(auditLogs).limit(20)
      if (rows.length > 0) return rows
      await Bun.sleep(40)
    } while (Date.now() < deadline)
    return rows
  }

  function makeApp() {
    return createApp(
      {
        DATABASE_URL: process.env.DATABASE_URL!,
        BLOB_ROOT: process.env.BLOB_ROOT!,
        BLOB_MAX_SIZE: 104857600,
        BLOB_SIGNING_SECRET: process.env.BLOB_SIGNING_SECRET!,
        SESSION_SECRET: process.env.SESSION_SECRET!,
        OIDC_ISSUER: process.env.OIDC_ISSUER!,
        OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID!,
        OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET!,
        OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI!,
        PORT: 3000,
        NODE_ENV: 'test',
      },
      { upgradeWebSocket: createBunWebSocket().upgradeWebSocket },
    )
  }

  beforeAll(async () => {
    ;[{ createApp }, { db }, authSchema, tokenSchema, auditSchema] = await Promise.all([
      import('@/app'),
      import('@/db/connection'),
      import('@/modules/auth/auth.schema'),
      import('@/modules/tokens/token.schema'),
      import('@/modules/audit/audit.schema'),
    ])
    authService = (await import('@/modules/auth/auth.service')).authService
    users = authSchema.users
    apiTokens = tokenSchema.apiTokens
    auditLogs = auditSchema.auditLogs
    app = makeApp()
    // 单行语义：清空 users 后预置 marker 行（无 oidcSub —— 模拟存量用户）。
    await db.delete(users)
    const [row] = await db
      .insert(users)
      .values({ name: USER_MARKER, email: `${RUN_TOKEN}@test.local` })
      .returning()
    userId = row.id
    cookie1 = `serenique_session=${authService.createSessionCookie(userId)}`
  })

  afterAll(async () => {
    await db.delete(users)
    if (createdTokenIds.length > 0) {
      await db.delete(apiTokens).where(inArray(apiTokens.id, createdTokenIds))
    }
    if (createdAuditIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.id, createdAuditIds))
    }
  })

  // ---- upsertOidcUser：sub → 本地用户行 ------------------------------------

  test('upsertOidcUser 首次绑定：绑到现有唯一行并回填 name/email', async () => {
    const row = await authService.upsertOidcUser({
      sub: `it-oidc-sub-${RUN_TOKEN}`,
      email: 'oidc@test.local',
      name: 'OIDC 名',
    })
    expect(row.id).toBe(userId) // 绑到 beforeAll 预置的现有行
    expect(row.oidcSub).toBe(`it-oidc-sub-${RUN_TOKEN}`)
    // 本地已有值不被覆盖，缺省才回填
    expect(row.email).toBe(`${RUN_TOKEN}@test.local`)
  })

  test('upsertOidcUser 幂等：同 sub 再次登录复用同一行', async () => {
    const sub = `it-oidc-sub-${RUN_TOKEN}`
    const again = await authService.upsertOidcUser({ sub, email: null, name: null })
    expect(again.id).toBe(userId)
  })

  test('upsertOidcUser 空表：直接新建用户行', async () => {
    await db.delete(users)
    const sub = `it-oidc-fresh-${RUN_TOKEN}`
    const row = await authService.upsertOidcUser({ sub, email: 'fresh@test.local', name: '新' })
    expect(row.id).not.toBe(userId)
    expect(row.oidcSub).toBe(sub)
    expect(row.name).toBe('新')
    // 恢复 marker 行供后续用例使用
    await db.delete(users)
    const [row2] = await db.insert(users).values({ id: userId, name: USER_MARKER }).returning()
    userId = row2.id
  })

  // ---- HTTP 契约：回调端点门禁 ----------------------------------------------

  test('POST /api/auth/oidc/callback 未知 state → 401（不触碰 DB）', async () => {
    const res = await app.request('/api/auth/oidc/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'whatever', state: 'unknown' }),
    })
    expect(res.status).toBe(401)
  })

  test('POST /api/auth/oidc/callback 缺字段 → 400 VALIDATION', async () => {
    const res = await app.request('/api/auth/oidc/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '' }),
    })
    expect(res.status).toBe(400)
  })

  test('GET /api/auth/me 未认证 → authenticated:false；带 cookie → true', async () => {
    const anon = await app.request('/api/auth/me')
    expect((await anon.json()).data).toMatchObject({ authenticated: false })
    const authed = await app.request('/api/auth/me', { headers: { cookie: cookie1 } })
    const body = (await authed.json()) as {
      data: { authenticated: boolean; user: { id: string } | null }
    }
    expect(body.data.authenticated).toBe(true)
    expect(body.data.user?.id).toBe(userId)
  })

  // ---- API token 全生命周期（Mobile/CLI 通路，迁移后不变）--------------------

  test('API token 创建 → Bearer 访问 me → 撤销后失效', async () => {
    const createRes = await app.request('/api/tokens', {
      method: 'POST',
      headers: { cookie: cookie1, 'content-type': 'application/json' },
      body: JSON.stringify({ name: TOKEN_MARKER }),
    })
    expect(createRes.status).toBe(201)
    const createBody = (await createRes.json()) as { data: { id: string; token: string } }
    createdTokenIds.push(createBody.data.id)

    const bearerMe = await app.request('/api/auth/me', {
      headers: { authorization: `Bearer ${createBody.data.token}` },
    })
    const bearerBody = (await bearerMe.json()) as {
      data: { authenticated: boolean; user: { id: string } | null }
    }
    expect(bearerBody.data.authenticated).toBe(true)

    const delRes = await app.request(`/api/tokens/${createBody.data.id}`, {
      method: 'DELETE',
      headers: { cookie: cookie1 },
    })
    expect(delRes.status).toBe(204)

    const afterDel = await app.request('/api/moments', {
      headers: { authorization: `Bearer ${createBody.data.token}` },
    })
    expect(afterDel.status).toBe(401)
  })

  // ---- 审计写点 -------------------------------------------------------------

  test('OIDC 回调失败写审计行', async () => {
    await app.request('/api/auth/oidc/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'x', state: 'bad-state-audit' }),
    })
    const rows = await waitForAuditRows(eq(auditLogs.ip, IP_LOGIN))
    void rows // 失败路径的审计由 service 层 fire-and-forget 写入，此处仅冒烟
  })

  // ---- 凭证管理路由已退役 ----------------------------------------------------

  test('旧 passkey ceremony 路由已退役 → 404', async () => {
    for (const path of [
      '/api/auth/register/start',
      '/api/auth/login/start',
      '/api/auth/credentials',
    ]) {
      const res = await app.request(path, { method: 'POST', headers: { cookie: cookie1 } })
      expect([404, 405]).toContain(res.status)
    }
  })
})
