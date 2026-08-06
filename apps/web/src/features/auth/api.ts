import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { ApiEnvelope } from '@/types/api'

// Auth 模块 API 契约。浏览器端凭证为 HttpOnly 会话 Cookie（credentials:include）。

export interface AuthStatus {
  authenticated: boolean
}

export async function login(token: string): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/login'), { json: { token } })
  return unwrap<AuthStatus>(res)
}

export async function logout(): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/logout'))
  return unwrap<AuthStatus>(res)
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  // 401 即未登录，不能让 ky 默认抛错（throwHttpErrors:true）——AuthGuard 需要拿到响应。
  const res = await api.get(apiUrl('auth/me'), { throwHttpErrors: false })
  const body = (await res.json()) as ApiEnvelope<AuthStatus>
  if (!body.success) {
    // 401 即未登录：AuthGuard 用它决定跳到登录页，不是错误。
    if (res.status === 401) return { authenticated: false }
    throw new Error(body.message || '查询认证状态失败')
  }
  return body.data as AuthStatus
}
