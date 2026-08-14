import { secureHeaders as honoSecureHeaders } from 'hono/secure-headers'

// ---------------------------------------------------------------------------
// 安全响应头中间件（hono 内置 secureHeaders）。
//
// 默认值大多适用（HSTS / nosniff / X-Frame-Options / Referrer-Policy …），
// 只有一处必须覆盖：
// - crossOriginResourcePolicy 放宽为 "cross-origin" —— 默认 same-origin 会
//   阻止 Web 前端跨域加载 blob 预览（<img>/<video> 是 no-cors 请求，会被
//   CORP: same-origin 拦截）；API 的 blob 文件本就通过 CORS_ORIGIN 白名单
//   服务跨域客户端。
// - 不启用 CSP：API 只回 JSON / 二进制，无 HTML 渲染面，CSP 无意义。
// ---------------------------------------------------------------------------

export function secureHeaders() {
  return honoSecureHeaders({
    crossOriginResourcePolicy: 'cross-origin',
  })
}
