import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'
import { api, apiUrl } from '@/api/client'
import { ApiError } from '@/api/errors'
import { unwrap } from '@/api/unwrap'
import type { ApiEnvelope } from '@/types/api'

// Auth 模块 API 契约（Passkey 时代，对齐 services/api auth 模块）。
// 浏览器端身份为 HttpOnly 会话 Cookie（credentials:include）；
// 注册/登录走 WebAuthn 双段 ceremony（start → finish）。

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

export interface CredentialEntry {
  id: string
  credentialId: string
  deviceLabel: string | null
  transports: string[] | null
  counter: number
  lastUsedAt: string | null
  createdAt: string
}

/** 引导期注册时携带的部署引导令牌（决策⑨：无 userInfo，用户由引导脚本创建）。 */
export interface RegisterStartInput {
  setupToken?: string
}

export interface RegisterStartResult {
  challengeId: string
  options: PublicKeyCredentialCreationOptionsJSON
}

export interface LoginStartResult {
  challengeId: string
  options: PublicKeyCredentialRequestOptionsJSON
}

export interface RegisterFinishInput {
  challengeId: string
  deviceLabel?: string
  credential: RegistrationResponseJSON
}

export interface LoginFinishInput {
  challengeId: string
  credential: AuthenticationResponseJSON
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

// ---- 注册 / 登录 ceremony（start 段返回 challengeId + 浏览器 options）--------

export async function registerStart(input: RegisterStartInput): Promise<RegisterStartResult> {
  const res = await api.post(apiUrl('auth/register/start'), { json: input })
  return unwrap<RegisterStartResult>(res)
}

export async function registerFinish(input: RegisterFinishInput): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/register/finish'), { json: input })
  return unwrap<AuthStatus>(res)
}

export async function loginStart(): Promise<LoginStartResult> {
  const res = await api.post(apiUrl('auth/login/start'))
  return unwrap<LoginStartResult>(res)
}

export async function loginFinish(input: LoginFinishInput): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/login/finish'), { json: input })
  return unwrap<AuthStatus>(res)
}

export async function logout(): Promise<AuthStatus> {
  const res = await api.post(apiUrl('auth/logout'))
  return unwrap<AuthStatus>(res)
}

// ---- 凭证管理（需登录会话）--------------------------------------------------

export async function listCredentials(): Promise<CredentialEntry[]> {
  const res = await api.get(apiUrl('auth/credentials'))
  const data = await unwrap<{ items: CredentialEntry[] }>(res)
  return data.items
}

export async function deleteCredential(id: string): Promise<void> {
  // 成功为 204 No Content（空 body）——不能走 unwrap（response.json() 会炸）。
  const res = await api.delete(apiUrl(`auth/credentials/${id}`))
  if (res.status === 204) return
  await unwrap<void>(res)
}

export async function renameCredential(id: string, deviceLabel: string | null): Promise<CredentialEntry> {
  const res = await api.patch(apiUrl(`auth/credentials/${id}`), { json: { deviceLabel } })
  return unwrap<CredentialEntry>(res)
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
