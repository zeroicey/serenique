import { Hono } from 'hono'
import type { upgradeWebSocket } from 'hono/bun'
import type { Env } from '@/env'
import { bodyLimit, cors, csrf, logger, rateLimit, secureHeaders, timeout } from '@/middleware'
import { createAiRouter } from '@/modules/ai'
import { auditRouter } from '@/modules/audit'
import { authMiddleware, authRouter } from '@/modules/auth'
import { blobRouter } from '@/modules/blob'
import { eventRouter } from '@/modules/event'
import { locationRouter } from '@/modules/location'
import { momentRouter } from '@/modules/moment'
import { tagRouter } from '@/modules/tag'
import { taskRouter } from '@/modules/task'
import { tokenRouter } from '@/modules/tokens'
import { logger as pinoLogger } from '@/shared/logger'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// App factory — receives validated env, returns an assembled Hono instance.
// Middleware and routes are wired here, in order.
//
// ws.upgradeWebSocket 由入口（index.ts 的 createBunWebSocket() 单例）注入：
// 必须与 Bun.serve 的 websocket handlers 同源，否则 WS 升级后消息无法送达。
// ---------------------------------------------------------------------------

export function createApp(env: Env, ws: { upgradeWebSocket: typeof upgradeWebSocket }) {
  // ---- 0. Fail-closed: 生产必须配置会话签名密钥与 RP ID，否则拒绝启动 -------
  //    （SETUP_TOKEN 注册完成后可移除，故不在此列 —— 见需求文档 ⑦）
  if (env.NODE_ENV === 'production' && (!env.SESSION_SECRET || !env.WEBAUTHN_RP_ID)) {
    throw new Error(
      '生产环境必须配置 SESSION_SECRET 与 WEBAUTHN_RP_ID 才能启动（认证 fail-closed）',
    )
  }

  const app = new Hono()

  // ---- 1. Global error handler --------------------------------------------
  //    Catches unhandled errors from any layer below.
  //
  app.onError((err, c) => {
    pinoLogger.error({ err, method: c.req.method, path: c.req.path }, 'Unhandled error')
    return Res.internalError().build(c)
  })

  // ---- 2. Global middleware -----------------------------------------------
  //    Order: CORS (preflight) → logger → security headers → rate limit →
  //    CSRF → body limit → timeout。各中间件设计见 middleware/*.ts。
  //
  app.use('*', cors())
  app.use('*', logger)
  app.use('*', secureHeaders())
  app.use('*', rateLimit())
  app.use('*', csrf())
  app.use('*', bodyLimit())
  app.use('*', timeout())

  // ---- 3. Meta routes -----------------------------------------------------
  //
  app.get('/health', (c) => Res.ok('服务运行中', { status: 'ok' }).build(c))
  app.get('/', (c) =>
    Res.ok('Serenique API', {
      modules: ['moment', 'blob', 'task', 'event', 'audit', 'tags', 'auth', 'tokens', 'location'],
    }).build(c),
  )

  // ---- 4. API modules -----------------------------------------------------
  //    Each module is a self-contained Hono instance mounted under /api.
  //
  app.use('/api/*', authMiddleware)
  app.route('/api', authRouter)
  app.route('/api', tokenRouter)
  app.route('/api', momentRouter)
  app.route('/api', blobRouter)
  app.route('/api', taskRouter)
  app.route('/api', eventRouter)
  app.route('/api', auditRouter)
  app.route('/api', tagRouter)
  app.route('/api', locationRouter)
  app.route('/api', createAiRouter(ws.upgradeWebSocket))

  // ---- 5. 404 fallback ----------------------------------------------------
  app.notFound((c) => Res.notFound('接口不存在').build(c))

  return app
}
