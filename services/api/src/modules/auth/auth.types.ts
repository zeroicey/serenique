import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth module — request/response types (Passkey era).
//
// The WebAuthn credential JSON payloads are kept deliberately permissive: the
// ceremony verification happens inside @simplewebauthn/server, Zod only checks
// the envelope (ids are base64url strings, type is "public-key", the inner
// response buffers are base64url-encoded).
// ---------------------------------------------------------------------------

/** YYYY-MM-DD 日期（可空字段用）。与 task 模块 DueDateSchema 同套路。 */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式须为 YYYY-MM-DD")
  .refine(
    (v) => {
      const parsed = Date.parse(`${v}T00:00:00Z`);
      return (
        !Number.isNaN(parsed) &&
        new Date(parsed).toISOString().slice(0, 10) === v
      );
    },
    "日期无效",
  );

// ---- Registration ceremony ------------------------------------------------

export const RegisterStartSchema = z.object({
  // users 表为空（引导注册）时必填；已有用户时忽略（走登录会话门禁）。
  setupToken: z.string().trim().min(1).max(200).optional(),
  // 引导注册时可选携带的初始个人信息。
  userInfo: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().min(1).max(200).optional(),
      birthday: DateOnlySchema.optional(),
    })
    .optional(),
});

export const RegistrationCredentialSchema = z.object({
  id: z.string().min(1).max(1023), // base64url
  rawId: z.string().min(1).max(1023), // base64url
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string().min(1), // base64url
    attestationObject: z.string().min(1), // base64url
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  transports: z
    .array(z.enum(["usb", "nfc", "ble", "internal", "hybrid"]))
    .max(10)
    .optional(),
});

export const RegisterFinishSchema = z.object({
  challengeId: z.string().uuid(),
  deviceLabel: z.string().trim().min(1).max(100).optional(),
  credential: RegistrationCredentialSchema,
});

// ---- Login ceremony -------------------------------------------------------

export const AuthenticationCredentialSchema = z.object({
  id: z.string().min(1).max(1023), // base64url
  rawId: z.string().min(1).max(1023), // base64url
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string().min(1), // base64url
    authenticatorData: z.string().min(1), // base64url
    signature: z.string().min(1), // base64url
    userHandle: z.string().optional(), // base64url
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
});

export const LoginFinishSchema = z.object({
  challengeId: z.string().uuid(),
  credential: AuthenticationCredentialSchema,
});

// ---- User profile ---------------------------------------------------------

/** 部分更新：缺省字段保持不变；"" 归一化为 null（清除）；至少提供一个字段。 */
export const UpdateUserProfileSchema = z
  .object({
    name: z
      .union([z.string().trim().min(1).max(100), z.literal("")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    email: z
      .union([z.string().trim().min(1).max(200), z.literal("")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    birthday: z
      .union([DateOnlySchema, z.literal("")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.email !== undefined || v.birthday !== undefined,
    "至少需要提供一个待更新字段",
  );

// ---- Input types (service layer) ------------------------------------------

export type RegisterStartInput = z.infer<typeof RegisterStartSchema>;
export type RegisterFinishInput = z.infer<typeof RegisterFinishSchema>;
export type LoginFinishInput = z.infer<typeof LoginFinishSchema>;
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;

export type RegisterUserInfo = {
  name?: string;
  email?: string;
  birthday?: string;
};

export type LoginFinishOutcome =
  | { status: "ok"; user: UserEntry }
  | { status: "throttled" }
  | { status: "rejected"; reason: "invalid" | "counter" };

// ---- Entry types (response layer) — times are ISO strings -----------------

export type UserEntry = {
  id: string;
  name: string | null;
  email: string | null;
  birthday: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CredentialEntry = {
  id: string;
  credentialId: string;
  deviceLabel: string | null;
  transports: AuthenticatorTransport[] | null;
  counter: number;
  lastUsedAt: string | null;
  createdAt: string;
};

/** /api/auth/me 载荷。authenticated:true 时 user 可为 null（令牌身份且尚未注册用户时）。 */
export type AuthMeEntry =
  | { authenticated: true; user: UserEntry | null }
  | { authenticated: false; user: null };
