import { z } from 'zod'

// ---------------------------------------------------------------------------
// Auth module — request/response types (Pocket ID OIDC era).
//
// 登录 = 授权码 + PKCE 重定向到认证中心（auth.zeroicey.me）；本模块只剩
// OIDC 跳转/回调两个入口 + 会话状态 + 个人信息。WebAuthn ceremony 类型已随
// Passkey 方案退役。
// ---------------------------------------------------------------------------

/** YYYY-MM-DD 日期（可空字段用）。与 task 模块 DueDateSchema 同套路。 */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
  .refine((v) => {
    const parsed = Date.parse(`${v}T00:00:00Z`)
    return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === v
  }, '日期无效')

// ---- OIDC 登录 --------------------------------------------------------------

export const OidcCallbackSchema = z.object({
  code: z.string().trim().min(1).max(2048),
  state: z.string().trim().min(1).max(256),
})

export type OidcCallbackInput = z.infer<typeof OidcCallbackSchema>

/** GET /api/auth/oidc/url 载荷：前端整页跳转目标。 */
export type OidcAuthorizeEntry = {
  authorizationUrl: string
}

// ---- User profile ---------------------------------------------------------

/** 部分更新：缺省字段保持不变；"" 归一化为 null（清除）；至少提供一个字段。 */
export const UpdateUserProfileSchema = z
  .object({
    name: z
      .union([z.string().trim().min(1).max(100), z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    email: z
      .union([z.string().trim().min(1).max(200), z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    birthday: z
      .union([DateOnlySchema, z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.email !== undefined || v.birthday !== undefined,
    '至少需要提供一个待更新字段',
  )

// ---- Input types (service layer) ------------------------------------------

export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>

/** ID Token claims 里我们关心的字段（openid-client 已完成签名/nonce 校验）。 */
export type OidcIdentity = {
  sub: string
  email: string | null
  name: string | null
}

// ---- Entry types (response layer) — times are ISO strings -----------------

export type UserEntry = {
  id: string
  name: string | null
  email: string | null
  birthday: string | null
  createdAt: string
  updatedAt: string
}

/** /api/auth/me 载荷。authenticated:true 时 user 可为 null（令牌身份且尚未注册用户时）。 */
export type AuthMeEntry =
  | { authenticated: true; user: UserEntry | null }
  | { authenticated: false; user: null }
