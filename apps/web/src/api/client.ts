import ky from 'ky'
import { env } from '@/config/env'

// 全局 Ky 实例。
// token 注入位点：API 加鉴权后，在 hooks.beforeRequest 里附加 Authorization 头。
export const api = ky.create({
  timeout: 15_000,
})

// 组装请求路径：统一挂到 /api 下。base 为空时走 dev proxy / prod 反向代理。
export function apiUrl(path: string): string {
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  return `${base}/api/${path.replace(/^\/+/, '')}`
}
