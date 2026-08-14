import type { Context } from 'hono'
import { type HonoConfigProps, MemoryStore, rateLimiter } from 'hono-rate-limiter'
import { env } from '@/env'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// 速率限制中间件（hono-rate-limiter + MemoryStore，进程内存窗口计数）。
//
// 设计要点：
// - 默认 100 次/分钟/IP（RATE_LIMIT_MAX 可调，缺省 100），单用户场景非常宽松；
// - /health 豁免 —— Docker HEALTHCHECK 与线上监控每 30s 探活一次，不能误伤；
// - NODE_ENV=test 整体跳过 —— bun test 单进程共享模块缓存与 env，全量单测
//   的请求数会触发误限流（中间件行为由 middleware.test.ts 单独覆盖）；
// - keyGenerator 取 X-Forwarded-For 首跳（生产走 Caddy/frp 反代，代理会注入
//   真实客户端 IP），无代理头时回退 "local"（本机/内网直连共用一口桶）。
// - 超限响应走统一信封（429 RATE_LIMITED），与 Res/AppError 契约一致。
// ---------------------------------------------------------------------------

export function rateLimit(
  opts?: Partial<Pick<HonoConfigProps, 'limit' | 'windowMs' | 'keyGenerator' | 'skip'>>,
) {
  return rateLimiter({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_MAX ?? 100,
    standardHeaders: 'draft-6',
    store: new MemoryStore(),
    keyGenerator: (c: Context) =>
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'local',
    skip: (c: Context) => c.req.path === '/health' || env.NODE_ENV === 'test',
    handler: (c: Context) =>
      Res.error('请求过于频繁，请稍后再试').status(429).code('RATE_LIMITED').build(c),
    ...opts,
  })
}
