// 派生 WebSocket 地址：优先 env.apiBaseUrl（生产跨域），否则当前 origin。
// http(s) → ws(s)；path 默认 /api/ai/ws。
import { env } from '@/config/env'

export function apiWsUrl(path = '/api/ai/ws'): string {
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '')
  const wsOrigin = origin.replace(/^http/, 'ws')
  return `${wsOrigin}${path.startsWith('/') ? path : `/${path}`}`
}
