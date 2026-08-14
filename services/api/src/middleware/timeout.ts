import type { Context, Next } from 'hono'
import { timeout as honoTimeout } from 'hono/timeout'
import { env } from '@/env'

// ---------------------------------------------------------------------------
// 请求超时中间件（hono 内置 timeout）。
//
// - 默认 60s（HTTP_TIMEOUT_MS 可调）。超时抛 HTTPException(504)，被 app.ts
//   的全局 onError 统一转成 500 响应信封（onError 对所有异常一律 500 是既有
//   契约，不改）。
// - /api/ai/* 豁免：AI 助手是 WebSocket 流式会话（/api/ai/ws），超时中间件
//   只包 HTTP 请求阶段，但为绝对不干扰流式链路，整个 AI 前缀直接放行。
// ---------------------------------------------------------------------------

export function timeout(ms?: number) {
  const duration = ms ?? env.HTTP_TIMEOUT_MS ?? 60_000
  const check = honoTimeout(duration)
  return async (c: Context, next: Next) => {
    if (c.req.path.startsWith('/api/ai')) return next()
    return check(c, next)
  }
}
