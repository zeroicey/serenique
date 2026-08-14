import { Hono } from 'hono'
import { env } from '@/env'
import { createAiWebSocket } from './ai.handler'

// ---------------------------------------------------------------------------
// AI 模块 router — 挂在 /api/ai/ws。
//
// Origin 白名单门禁先于 upgradeWebSocket 执行：浏览器对 WS 握手不做 CORS
// 预检，生产 cookie SameSite=None 时任意网站可带 cookie 发起连接（跨站
// WebSocket 劫持），必须校验 Origin —— 不在白名单直接 403，不进入升级。
// 无 Origin 头（同源 / 非浏览器客户端）放行。
// ---------------------------------------------------------------------------

const ALLOWED = new Set<string>()
if (process.env.CORS_ORIGIN) ALLOWED.add(process.env.CORS_ORIGIN)
for (const origin of env.WEBAUTHN_ORIGINS) ALLOWED.add(origin)

export function createAiRouter(upgradeWebSocket: typeof import('hono/bun').upgradeWebSocket) {
  const router = new Hono()

  router.use('/ai/ws', async (c, next) => {
    const origin = c.req.header('Origin')
    if (origin && !ALLOWED.has(origin)) {
      return c.text('Forbidden', 403)
    }
    await next()
  })
  router.get('/ai/ws', createAiWebSocket(upgradeWebSocket))

  return router
}
