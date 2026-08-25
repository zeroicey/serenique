import { api, apiUrl } from '@/api/client'
import { ApiError } from '@/api/errors'
import { unwrap } from '@/api/unwrap'
import type { ApiEnvelope } from '@/types/api'

// Auth 模块 API 契约（Pocket ID OIDC 时代，对齐 services/api auth 模块）。
// 浏览器端身份为 HttpOnly 会话 Cookie（credentials:include）；
// 登录 = 跳转认证中心（授权码 + PKCE 在服务端完成交换与验签）。

export interface UserEntry {
  id: string
  name: string | null
  email: string | null
  birthday: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthStatus {
  authenticated: boolean
  user: UserEntry | null
}

// ---- 会话状态 --------------------------------------------------------------

export async function fetchAuthStatus(): Promise<AuthStatus> {
  // 401 即未登录（client 全局 throwHttpErrors:false 不会抛错）——AuthGuard 需要拿到响应。
  const res = await api.get(apiUrl('auth/me'))
  const body = (await res.json()) as ApiEnvelope<AuthStatus>
  if (!body.success) {
    // 401 即未登录：AuthGuard 用它决定跳到登录页，不是错误。
    if (res.status === 401) return { authenticated: false, user: null }
    throw new ApiError(body.message || '查询认证状态失败', res.status, body.error)
  }
  return body.data as AuthStatus
}

// ---- OIDC 登录 -------------------------------------------------------------

/** GET /api/auth/oidc/url 载荷。 */
export interface OidcAuthorizeResult {
  authorizationUrl: string
}

/**
 * 取认证中心授权跳转地址（state/nonce/PKCE 登录态由服务端生成并保存）。
 * 返回前做安全校验：只放行 http(s) 绝对地址（防伪协议注入；URL 本身来自
 * 我方 API，但纵深防御不依赖该前提）。非 http(s) → 抛 ApiError 不跳转。
 */
export async function fetchOidcAuthorizeUrl(): Promise<OidcAuthorizeResult> {
  const res = await api.get(apiUrl('auth/oidc/url'))
  const result = await unwrap<OidcAuthorizeResult>(res)
  let parsed: URL
  try {
    parsed = new URL(result.authorizationUrl)
  } catch {
    throw new ApiError('认证中心返回了无效的跳转地址', 502, 'BAD_REDIRECT')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ApiError('认证中心返回了不受支持的跳转协议', 502, 'BAD_REDIRECT')
  }
  return { authorizationUrl: parsed.href }
}

/** 回调：把认证中心带回的 code+state 交给服务端换 token 建会话。 */
export async function postOidcCallback(input: {
  code: string
  state: string
}): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/oidc/callback'), { json: input })
  return unwrap<AuthStatus>(res)
}

export async function logout(): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/logout'))
  return unwrap<AuthStatus>(res)
}

// ---- 个人信息（需登录会话）--------------------------------------------------

export async function getProfile(): Promise<UserEntry> {
  const res = await api.get(apiUrl('users/me'))
  return unwrap<UserEntry>(res)
}

/** 部分更新：缺省字段保持不变；传 '' 即清除（对齐服务端 "" → null 归一化）。 */
export interface UpdateProfileInput {
  name?: string
  email?: string
  birthday?: string
}

export async function updateProfile(input: UpdateProfileInput): Promise<UserEntry> {
  const res = await api.put(apiUrl('users/me'), { json: input })
  return unwrap<UserEntry>(res)
}
