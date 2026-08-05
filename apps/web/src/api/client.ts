import ky from 'ky'
import { env } from '@/config/env'

// 全局 Ky 实例。
// token 注入位点：API 加鉴权后，在 hooks.beforeRequest 里附加 Authorization 头。
export const api = ky.create({
  timeout: 15_000,
})

// 组装请求路径：统一挂到 /api 下。
// base 为空时补当前 origin（dev 由 Vite proxy / prod 由反向代理转发 /api）。
// 返回绝对 URL：ky 在非浏览器环境（vitest/undici）不接受相对路径，浏览器端也等价。
export function apiUrl(path: string): string {
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${origin}/api/${path.replace(/^\/+/, '')}`
}
