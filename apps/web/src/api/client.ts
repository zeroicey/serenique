import ky from 'ky'
import { env } from '@/config/env'

// 全局 Ky 实例。
// token 注入位点：API 加鉴权后，在 hooks.beforeRequest 里附加 Authorization 头。
export const api = ky.create({
  timeout: 15_000,
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
