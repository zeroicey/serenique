import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BLOB_ROOT: z.string().min(1),
  BLOB_MAX_SIZE: z.coerce.number().positive().default(100 * 1024 * 1024), // 100 MB
  BLOB_SIGNING_SECRET: z.string().min(32).optional(),
  AUTH_TOKEN: z.string().min(32).optional(),
  // 会话 TTL（秒），未配置时 service 回退 DEFAULT_SESSION_TTL_SECONDS（30 天）。
  // 用 optional 而非 default：Env 类型不要求必填，避免 createApp(env) 调用方
  // 必须显式传值（app.test.ts / 集成测试均未传）。
  SESSION_TTL: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
