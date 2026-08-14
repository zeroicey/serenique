import { cors as honoCors } from 'hono/cors'

// ---------------------------------------------------------------------------
// CORS middleware — allow all origins in development, configure in production.
// 设置 CORS_ORIGIN 时（生产，如 https://serenique-web.pages.dev）启用凭证
// 模式（credentials:true）——带 Cookie 的跨域请求不允许 origin 为 "*"。
// ---------------------------------------------------------------------------

export function cors() {
  const origin = process.env.CORS_ORIGIN ?? '*'
  return honoCors({
    origin,
    credentials: origin !== '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Content-Disposition', 'Authorization'],
    maxAge: 86400,
  })
}
