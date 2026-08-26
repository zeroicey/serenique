import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BLOB_ROOT: z.string().min(1),
  BLOB_MAX_SIZE: z.coerce
    .number()
    .positive()
    .default(100 * 1024 * 1024), // 100 MB
  BLOB_SIGNING_SECRET: z.string().min(32).optional(),
  // ---- 认证（Pocket ID OIDC，见 .ai/requirements/2026-08-26-pocket-id-auth-migration.md）----
  // 会话 Cookie 签名密钥（≥32 字符，独立于任何令牌）。生产缺失 → createApp
  // 拒绝启动（fail-closed）。cookie 载荷携带 userId，换密钥 = 全端会话失效。
  SESSION_SECRET: z.string().min(32).optional(),
  // 认证中心（Pocket ID）四元组：issuer 发现文档、客户端凭据与回调地址。
  // 未配置（dev）→ 认证整体跳过（本地零摩擦）；任一缺失（生产）→ 拒绝启动。
  // client_secret 只存服务器 .env，绝不进前端构建产物；token 交换在 API 后端完成。
  OIDC_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  // 生产 https://serenique.0icey.icu/auth/callback；dev http://localhost:5173/auth/callback。
  // 必须与 Pocket ID 后台注册的 Callback URLs 精确一致。
  OIDC_REDIRECT_URI: z.url().optional(),
  // 移动端回调（自定义 scheme，非 http(s) URL 故不用 z.url()）。可选：未配置时
  // 移动端登录端点返回 503；配置后需同步在 Pocket ID 后台注册同一回调。
  OIDC_MOBILE_REDIRECT_URI: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*:\/\//, '移动端回调须为自定义 scheme URI')
    .optional(),
  // 会话 TTL（秒），未配置时 service 回退 DEFAULT_SESSION_TTL_SECONDS（3 天）。
  // 用 optional 而非 default：Env 类型不要求必填，避免 createApp(env) 调用方
  // 必须显式传值（app.test.ts / 集成测试均未传）。
  SESSION_TTL: z.coerce.number().int().positive().optional(),
  // 审计日志自动清理阈值（可选）：保留天数 / 最大条数，缺省 90 天 / 5000 条。
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
  AUDIT_MAX_ROWS: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // ---- AI 助手（宁序，见 .ai/requirements/2026-08-09-ai-agent-module.md）----
  // 会话 jsonl 目录。生产缺省 /data/sessions（容器卷）；dev/test 用项目内目录，
  // 避免 Mac 上 /data 不存在。
  AI_SESSION_DIR: z.string().optional(),
  // 模型选择 "provider/modelId"，缺省走 newapi 自定义 OpenAI 兼容端点。
  // 凭据/端点解析见 ai.service.ts：显式配置 AI_API_KEY/AI_BASE_URL 时优先生成
  // env 驱动配置（模型目录只含 AI_MODEL 这一个 id）；否则复用 ~/.pi/agent/models.json
  // 的 newapi 提供者（开发机零配置）；都没有时（如生产容器缺 key）按未配置处理。
  // 换端点/换模型 = 只改 .env，无需改代码。
  AI_MODEL: z.string().optional(),
  // 生成 models.json 时单模型的上下文窗口/最大输出 token 兜底值（可选）。
  // 网关不暴露这些元数据，保守默认值够用；特殊模型按需覆盖。
  AI_CONTEXT_WINDOW: z.coerce.number().int().positive().optional(),
  AI_MAX_TOKENS: z.coerce.number().int().positive().optional(),
  // OpenAI 兼容端点 baseUrl（缺省 hpcore NewAPI 网关，见 ai.service.ts DEFAULT_AI_BASE_URL）。
  AI_BASE_URL: z.url().optional(),
  // OpenAI 兼容端点 API Key（生成生产 models.json 时必需；开发机缺省读用户级配置）。
  AI_API_KEY: z.string().min(16).optional(),
  // ---- 安全中间件（hono 内置 + hono-rate-limiter，见 middleware/*.ts）----
  // 速率限制：固定 60s 窗口内每 IP 最大请求数（默认 100，单用户场景很宽松）。
  // /health 自动豁免（Docker HEALTHCHECK 与线上监控每 30s 探活一次）；
  // NODE_ENV=test 整体跳过（bun test 单进程共享模块缓存，全量单测请求数
  // 会触发误限流）。用 optional 而非 default（同 SESSION_TTL 注释）：
  // Env 类型不要求必填，避免 createApp(env) 调用方（app.test.ts / 集成测试）
  // 必须显式传值；缺省值在 middleware/rate-limit.ts 回退。生产无需新增 env。
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
  // 请求体上限（字节），默认 100MB。运行时取 max(缺省值, BLOB_MAX_SIZE + 1MB)，
  // 保证 /api/blobs/upload 的 100MB 上传不被 body-limit 误杀（multipart 信封
  // 有额外开销；文件大小校验由 blob.service 的 assertBlobSize 负责）。
  BODY_LIMIT_MAX_SIZE: z.coerce.number().positive().optional(),
  // 请求处理超时（毫秒），默认 60s。/api/ai/*（WebSocket 流式）自动豁免。
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // ---- 位置服务（高德 Web 服务代理，见 .ai/requirements/2026-08-08-moment-location.md）----
  // 高德 Web 服务 Key。未配置 → GET /api/location/config 返回 enabled=false，
  // /api/location/nearby|search 返回 503「位置服务未配置」。可选，不参与生产
  // fail-closed 校验（位置选点是可选项）。schema 只做类型校验与文档化；
  // location service 直接读 process.env.AMAP_KEY（运行期可注入/变更，便于单测）。
  AMAP_KEY: z.string().min(1).optional(),
  // ---- 文件存储后端（见 .ai/requirements/2026-08-20-object-storage-r2.md）----
  // 存储后端：local（默认，现有 BLOB_ROOT 磁盘实现）| r2（Cloudflare R2，S3 协议）。
  // 切换仅改此 env，本地后端保留作回滚/迁移期兜底。用 optional + storage.ts 回退
  // （同 SESSION_TTL 注释）：避免给测试文件的 createApp(env) 字面量带来必填字段。
  STORAGE_BACKEND: z.enum(['local', 'r2']).optional(),
  // R2 凭据（STORAGE_BACKEND=r2 时必需；local 模式可缺省）。
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  // 自定义 S3 endpoint（缺省为 https://<account-id>.r2.cloudflarestorage.com）。
  R2_ENDPOINT: z.url().optional(),
  // 签名直链 secret（≥32 字符）与 public host：与 serenique-r2-gateway Worker
  // 同名 secret binding 同值（s3.0icey.icu）。见 infra/r2-gateway/gateway.js。
  R2_ACCESS_SIGNING_SECRET: z.string().min(32).optional(),
  R2_PUBLIC_HOST: z.string().min(1).optional(),
})

export type Env = z.infer<typeof envSchema>

export const env = envSchema.parse(process.env)

export const aiSessionDir =
  env.AI_SESSION_DIR ?? (env.NODE_ENV === 'production' ? '/data/sessions' : './.data/sessions')
// 缺省走 newapi 提供者（OpenAI 兼容自定义端点，见 ai.service.ts 的解析逻辑）。
export const aiModel = env.AI_MODEL ?? 'newapi/ox-alpha'
