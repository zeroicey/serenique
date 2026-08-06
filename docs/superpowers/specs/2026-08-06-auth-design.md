# 2026-08-06 — 认证（Auth）设计文档

状态：**设计中**（方案已确认，待实现计划与实施）。需求文档：`.ai/requirements/2026-08-06-auth.md`。

## 背景

API 已公网暴露于 `https://api.zeroicey.me`（frp 隧道 + Caddy，Let's Encrypt TLS），Web 前端已上线 `https://serenique-web.pages.dev`（Cloudflare Pages，跨域直调 API）。当前**无任何认证**——任何人拿到域名即可读写日记。本项目为**个人单用户**、开源可自部署：不需要授权/多用户/角色，只需要认证。

## 目标与约束

- 确认请求来自部署者本人（唯一用户 = 部署者）。
- 多端统一：Web（浏览器）、CLI（Go）、MCP（内部直连 + streamable-http）、移动端 Flutter（规划）。
- 凭证强度优先：不用「人类可记的密码」；不引入 SSO 的复杂度。
- 换密钥即可全端失效；不为此建会话表。

## 关键决策（用户确认）

1. **方案 A：单一高熵共享密钥**。`AUTH_TOKEN`（≥32 字符，建议 48+）写入根 `.env`，所有端共用。
2. **Web 登录 = 表单 + HttpOnly 签名 Cookie**（无状态，非会话表）。
3. **换密钥 = 全端失效**，零会话表、零 users 表、零迁移。
4. **SSO/OIDC 现在不做**；认证层按可插拔策略设计，留 JWT 校验后门。

## 架构

```
请求 → CORS → logger → [auth 中间件] → 模块路由(diary/moment/blob/task/event)
                              ↑
                  Bearer 密钥 | 签名 Cookie | 放行列表
```

新模块 `src/modules/auth/`，沿用分层骨架：

| 文件 | 职责 |
|------|------|
| `auth.types.ts` | Zod 校验（login body `{ token }`）+ 类型 |
| `auth.domain.ts` | 纯函数：Cookie 签名 / 验签 / 过期判断、常量时间比对（无 DB/IO import） |
| `auth.service.ts` | 单例 `authService`：凭证校验、签发会话 Cookie、读取会话 TTL |
| `auth.handler.ts` | Zod 解析 → service → `Res`；login/logout/me |
| `auth.router.ts` | `/api/auth/*` 路由 |
| `auth.middleware.ts` | 全局认证门（Bearer / Cookie / 放行） |
| `index.ts` | barrel |

## 凭证与配置（env）

| env | 说明 |
|-----|------|
| `AUTH_TOKEN` | 高熵随机密钥，≥32 字符。**生产缺失则启动即拒绝**（fail closed）；dev 未设置跳过认证 |
| `SESSION_TTL` | Cookie 有效期（秒），默认 30 天 |
| `CORS_ORIGIN` | 生产显式设 `https://serenique-web.pages.dev`（带凭证跨域不允许 `*`） |

Cookie `serenique_session`：

- 值格式 `exp.signature`，`signature = HMAC-SHA256(AUTH_TOKEN, "serenique-session." + exp)`（复用 blob 模块 `signBlobAccess` 模式）。
- `HttpOnly`、`Secure`、`SameSite=None`（Web 与 API 跨站）、`Path=/`、`Max-Age=SESSION_TTL`。
- 无状态：验签 + 过期即可，不查库。换 `AUTH_TOKEN` → 旧 Cookie 失效。

## API 面

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | `{ token }` → 常量时间比对 → 签发 Cookie |
| POST | `/api/auth/logout` | 清 Cookie |
| GET | `/api/auth/me` | `{ authenticated: true }` |

**中间件放行列表**（其余 `/api/*` 一律要求凭证）：

- `/health`、`/`（公网监控/探测）
- `/api/auth/login`
- `/api/blobs/:id/file`（签名 blob 链接必须保持公开，由既有 `expires+signature` 校验把关）

**失败响应**：401 `{ success:false, code:"UNAUTHORIZED", message:"未认证或登录已过期" }`。`shared/errors.ts` 新增 `UNAUTHORIZED`、`RATE_LIMITED` 码。

**防爆破**：login 失败 `await sleep(500)`；同 IP 短窗 ≥5 次失败 → 429 封禁数分钟。单进程内存 Map（单容器场景）。

## 数据流

1. **Web**：加载 → `GET /api/auth/me`（带 Cookie）→ 401 → `/login` → `POST /api/auth/login {token}` → 签发 Cookie → 正常请求全带 Cookie。
2. **CLI/移动端**：`auth login` 存密钥（config / Keychain）→ 请求带 `Authorization: Bearer <AUTH_TOKEN>`。
3. **换密钥**：改 `.env` → `docker compose up -d` 重启 → 旧 Cookie 与新 token 全部失效。

## 各端接入

| 端 | 改动 |
|----|------|
| Web | `/login` 页；所有请求 `credentials:"include"`；`auth/me` 驱动登录态（TanStack Query）；不存 localStorage |
| CLI | `auth login`（打码写 config，`0600` 已就绪）/ `auth logout` / `auth me`；client 自动带 Bearer |
| 移动端（规划） | 登录页 → 密钥存 Keychain/Keystore → Bearer |
| MCP | 内部直连 DB 调 service 层，不受 API HTTP 认证影响；其 streamable-http（3001）加同密钥 Bearer 校验（compose 共用 `.env`） |

## 错误处理与边界

- Cookie 过期 / 被篡改 → 401 → Web 跳 `/login`。
- 密钥比对、签名比对全部常量时间（`timingSafeEqual`）。
- login 慢速 + 封禁（见上）。
- dev 未设 `AUTH_TOKEN`：认证跳过（本地零摩擦）；生产缺失：启动失败（fail closed）。

## 测试

- `auth.domain.test.ts`：Cookie 签名 / 验签 / 过期 / 篡改拒绝、常量时间比对（无 DB）。
- `auth.service.test.ts`：凭证校验、会话签发（无 DB）。
- `auth.service.integration.test.ts`（`RUN_DB_TESTS=1`）：登录→Cookie→访问；错误密钥→401；Bearer 通；签名 blob 链接仍公开。
- Web：登录页 + auth 状态 hook 单测；CLI：auth 配置往返测试。

## 部署

- 根 `.env` 加 `AUTH_TOKEN`、`CORS_ORIGIN=https://serenique-web.pages.dev`。
- **上线前先配好密钥**（生产缺 `AUTH_TOKEN` 会启动失败）。
- 发布走「推 main → 打 tag」。

## 未来（留后门，不实现）

认证中间件按**可插拔策略**设计：目前唯一策略是「共享密钥」；将来若想「用 Google/GitHub 登录」，仅新增一个 OIDC JWT 校验策略（JWKS 验签、取 `sub` 作身份），不影响现有端与凭证。
