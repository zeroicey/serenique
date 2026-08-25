// ---------------------------------------------------------------------------
// Origin 白名单（CSRF 中间件与 AI WS 门禁共用）。
//
// = CORS_ORIGIN（生产 Web 前端域名）+ OIDC_REDIRECT_URI 的 origin（登录回跳
// 后前端从该 origin 发起 API 请求）+ dev 常用端口兜底。
// ---------------------------------------------------------------------------

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000']

export function buildOriginWhitelist(): string[] {
  const origins = new Set<string>(DEV_ORIGINS)
  if (process.env.CORS_ORIGIN) origins.add(process.env.CORS_ORIGIN)
  if (process.env.OIDC_REDIRECT_URI) {
    try {
      origins.add(new URL(process.env.OIDC_REDIRECT_URI).origin)
    } catch {
      // 无效配置由 env 校验与启动 fail-closed 兜底，这里不另生错误路径。
    }
  }
  return [...origins]
}
