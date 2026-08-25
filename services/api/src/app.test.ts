import { describe, expect, test } from 'bun:test'
import { createBunWebSocket } from 'hono/bun'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// REST contract smoke tests — lock the behavior most at risk from handler /
// response refactors, without needing a database:
//   - malformed JSON body → 400 (unified handleError)
//   - unknown route → unified 404 shape
//   - /health → 200
//   - 旧 /api/auth/login 路由已退役 → 404
//   - 全模块 :id 参数 UUID 校验 → 400（不落 DB）
//
// Auth middleware is enabled (like every other test file — bun test shares one
// env across files). Requests authenticate via a session cookie minted with
// the pure HMAC signer (createSessionCookie 不碰 DB)，所以整个文件保持 DB-free；
// 不用 mock.module —— bun test 单进程共享模块缓存，mock 会泄漏到其它文件。
// ---------------------------------------------------------------------------

setTestEnv()

describe('REST contract smoke', () => {
  async function makeAuthedApp() {
    const [{ createApp }, { authService }] = await Promise.all([
      import('@/app'),
      import('@/modules/auth/auth.service'),
    ])
    const app = createApp(
      {
        DATABASE_URL: 'postgresql://serenique:serenique@127.0.0.1:5432/serenique',
        BLOB_ROOT: '/tmp/serenique-app-test',
        BLOB_MAX_SIZE: 104857600,
        BLOB_SIGNING_SECRET: 'test-signing-secret-0123456789abcdef',
        SESSION_SECRET: 'test-session-secret-0123456789abcdef',
        OIDC_ISSUER: 'https://auth.zeroicey.me',
        OIDC_CLIENT_ID: 'test-client-id',
        OIDC_CLIENT_SECRET: 'test-client-secret-0123456789',
        OIDC_REDIRECT_URI: 'http://localhost:5173/auth/callback',
        PORT: 3000,
        NODE_ENV: 'test',
      },
      { upgradeWebSocket: createBunWebSocket().upgradeWebSocket },
    )
    // 纯 HMAC 会话 cookie（无 DB）：中间件 cookie 分支只验签。
    const value = authService.createSessionCookie('0198f6d0-9e7c-71d7-8214-2a0f7f5f9001')
    return { app, cookie: `serenique_session=${value}` }
  }

  test('GET /health returns 200', async () => {
    const { app } = await makeAuthedApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ status: 'ok' })
  })

  test('malformed JSON body maps to 400, not 500', async () => {
    const { app, cookie } = await makeAuthedApp()
    const res = await app.request('/api/moments', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{ not valid json',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('blob attachment create with malformed JSON maps to 400 (was 500)', async () => {
    const { app, cookie } = await makeAuthedApp()
    const res = await app.request('/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/attachments', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{ broken',
    })
    expect(res.status).toBe(400)
  })

  test('unknown route returns the unified 404 shape', async () => {
    const { app, cookie } = await makeAuthedApp()
    const res = await app.request('/api/nope', { headers: { cookie } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('旧 /api/auth/login（共享密钥时代）已退役 → 404', async () => {
    const { app, cookie } = await makeAuthedApp()
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'whatever' }),
    })
    expect(res.status).toBe(404)
  })

  test('invalid UUID path params map to 400 VALIDATION, not 500', async () => {
    // Handlers validate the :id/:attachmentId param as a UUID before touching
    // the DB, so a malformed id must never surface as an unrelated 500 from a
    // database query. Regression for the moment/blob handlers, which used to
    // pass any non-empty string straight through to the service.
    const { app, cookie } = await makeAuthedApp()
    const badRequests: Array<{ path: string; method?: string }> = [
      { path: '/api/moments/not-a-uuid' },
      { path: '/api/tasks/not-a-uuid' },
      { path: '/api/task-groups/not-a-uuid' },
      { path: '/api/events/not-a-uuid' },
      { path: '/api/blobs/not-a-uuid' },
      { path: '/api/blobs/not-a-uuid/file' },
      { path: '/api/blob-attachments/not-a-uuid', method: 'DELETE' },
      {
        path: '/api/moments/not-a-uuid/attachments/not-a-uuid',
        method: 'DELETE',
      },
      { path: '/api/tags/not-a-uuid' },
      { path: '/api/tags/not-a-uuid', method: 'PUT' },
      { path: '/api/tags/not-a-uuid', method: 'DELETE' },
      { path: '/api/tags/not-a-uuid/attach', method: 'POST' },
      { path: '/api/tags/not-a-uuid/detach', method: 'DELETE' },
      { path: '/api/moments/not-a-uuid/tags', method: 'POST' },
      { path: '/api/moments/not-a-uuid/tags', method: 'PUT' },
      {
        path: '/api/moments/not-a-uuid/tags/not-a-uuid',
        method: 'DELETE',
      },
      { path: '/api/tokens/not-a-uuid', method: 'DELETE' },
    ]
    for (const { path, method } of badRequests) {
      const res = await app.request(path, {
        method: method ?? 'GET',
        headers: { cookie },
      })
      // 400 (VALIDATION)，never the 500 a malformed id used to trigger once it
      // reached the database layer.
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.success).toBe(false)
    }
  })
})
