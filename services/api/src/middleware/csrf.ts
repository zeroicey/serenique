import type { Context, Next } from 'hono'
import { csrf as honoCsrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { env } from '@/env'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// CSRF 中间件 —— hono/csrf 封装，Origin 白名单校验。
//
// hono/csrf 只拦截「表单类型」不安全方法（multipart/urlencoded/text-plain）：
// 浏览器跨站表单是唯一不需要 CORS 预检就能带 Cookie 发起的攻击面（JSON
// 请求会先被 cors.ts 的预检拦截）。跨站表单伪造 multipart 上传 / 登出等
// 请求（SameSite=None 的会话 cookie 会被带上）是真实威胁，必须拦。
//
// 本项目同时被非浏览器客户端使用（apps/cli、curl、MCP）——它们不发 Origin
// 头。hono/csrf 对「表单 content-type 但无 Origin 头」的请求也会 403，
// 因此这里包一层：无 Origin 头（非浏览器客户端）直接放行，与 ai.router.ts
// 的 WebSocket Origin 门禁同策略；有 Origin 头则必须命中白名单，否则 403。
//
// 白名单 = CORS_ORIGIN（生产 Web 前端域名）+ WEBAUTHN_ORIGINS（dev 端口 /
// 未来移动端 origin），与 AI WS 门禁一致。
//
// hono/csrf 拦截时抛 HTTPException(403)，而 app.ts 的全局 onError 会把一切
// 异常转成 500 —— 这里在中间件层把 403 转成统一响应信封（FORBIDDEN），
// 避免跨站拦截被误报成服务端错误。
// ---------------------------------------------------------------------------

function buildOriginWhitelist(): string[] {
  const origins = new Set<string>()
  if (process.env.CORS_ORIGIN) origins.add(process.env.CORS_ORIGIN)
  for (const origin of env.WEBAUTHN_ORIGINS) origins.add(origin)
  return [...origins]
}

export function csrf(origins?: string[]) {
  const whitelist = origins ?? buildOriginWhitelist()
  if (whitelist.length === 0) {
    // 白名单为空（理论上不会：WEBAUTHN_ORIGINS 有默认值）→ 降级为无操作，
    // 避免 hono/csrf 用空数组拒绝所有带 Origin 的请求。
    return async (_c: Context, next: Next) => next()
  }
  const check = honoCsrf({ origin: whitelist })
  return async (c: Context, next: Next) => {
    if (!c.req.header('Origin')) return next()
    try {
      return await check(c, next)
    } catch (err) {
      if (err instanceof HTTPException && err.status === 403) {
        return Res.forbidden('跨站请求被拒绝').build(c)
      }
      throw err
    }
  }
}
