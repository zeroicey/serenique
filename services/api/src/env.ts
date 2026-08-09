import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BLOB_ROOT: z.string().min(1),
  BLOB_MAX_SIZE: z.coerce.number().positive().default(100 * 1024 * 1024), // 100 MB
  BLOB_SIGNING_SECRET: z.string().min(32).optional(),
  // ---- 认证（Passkey 重构，见 .ai/requirements/2026-08-09-passkey-auth.md）----
  // 会话 Cookie 签名密钥（≥32 字符，独立于任何令牌）。生产缺失 → createApp
  // 拒绝启动（fail-closed）。cookie 载荷携带 userId，换密钥 = 全端会话失效。
  SESSION_SECRET: z.string().min(32).optional(),
  // 引导注册令牌：凭证计数为 0（引导期）时注册必须携带（常量时间比对）。
  // 首个凭证创建完成后可从 env 移除（生产不强制，见需求 ⑦⑨）。
  SETUP_TOKEN: z.string().min(32).optional(),
  // WebAuthn RP ID（= 前端域名，如 serenique-web.pages.dev / localhost）。
  // 未配置（dev）→ 认证整体跳过（本地零摩擦）；生产缺失 → 拒绝启动。
  WEBAUTHN_RP_ID: z.string().min(1).optional(),
  // RP 展示名（浏览器 passkey 弹窗里显示）。
  WEBAUTHN_RP_NAME: z.string().min(1).default("Serenique"),
  // 允许的 WebAuthn origin（逗号分隔；ceremony 的 expectedOrigin 白名单）。
  WEBAUTHN_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:3000")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .refine((arr) => arr.length > 0, "WEBAUTHN_ORIGINS 不能为空"),
  // 会话 TTL（秒），未配置时 service 回退 DEFAULT_SESSION_TTL_SECONDS（30 天）。
  // 用 optional 而非 default：Env 类型不要求必填，避免 createApp(env) 调用方
  // 必须显式传值（app.test.ts / 集成测试均未传）。
  SESSION_TTL: z.coerce.number().int().positive().optional(),
  // 审计日志自动清理阈值（可选）：保留天数 / 最大条数，缺省 90 天 / 5000 条。
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  AUDIT_MAX_ROWS: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
