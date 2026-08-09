import ky from 'ky'
import { env } from '@/config/env'

// 全局 Ky 实例。
// token 注入位点：API 加鉴权后，在 hooks.beforeRequest 里附加 Authorization 头。
// throwHttpErrors:false —— 非 2xx 也返回 Response，由各 feature 的 unwrap 解析统一
// envelope 并抛带 status 的 ApiError；若用 ky 默认（非 2xx 直接抛 HTTPError），
// 服务端中文文案与状态码都会丢失（/setup 页区分 403/401/500 依赖它们）。
export const api = ky.create({
  timeout: 15_000,
  throwHttpErrors: false,
  // 认证 Cookie 跨站携带（生产 pages.dev → api.zeroicey.me）。
  credentials: 'include',
})

// 组装请求路径：统一挂到 /api 下。
// base 为空时补当前 origin（dev 由 Vite proxy / prod 由反向代理转发 /api）。
// 返回绝对 URL：ky 在非浏览器环境（vitest/undici）不接受相对路径，浏览器端也等价。
export function apiUrl(path: string): string {
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${origin}/api/${path.replace(/^\/+/, '')}`
}

// 把 API 相对路径（如 /api/blobs/x/file）解析为绝对 URL（供 <img src> 等场景）。
export function resolveApiPath(path: string): string {
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}
