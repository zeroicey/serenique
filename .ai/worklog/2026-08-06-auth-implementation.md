# 2026-08-06 — 认证（Auth）实施（API / Web / CLI / MCP 四端 + 部署配置）

按 `.ai/requirements/2026-08-06-auth.md` 实施，设计见 `docs/superpowers/specs/2026-08-06-auth-design.md`。API / Web / CLI / MCP 四端同步完成并验证，最后收尾部署配置与文档。（本 worklog 于 2026-08-07 定稿。）

## 本次完成

**API 服务（services/api）**
- 新增 `src/modules/auth/` 模块，沿用分层骨架：`auth.types.ts`（`LoginSchema { token }` 1..200）、`auth.domain.ts`（纯函数：Cookie 签名 / 验签 / 过期判定、`secretsEqual` 常量时间比对、login 防爆破节流状态机，无 DB/IO import）、`auth.service.ts`（单例 `authService`：`isAuthEnabled` / `authenticate` / `createSessionCookie` / `verifySessionCookie` / `login`，无会话表）、`auth.handler.ts`（login / logout / me）、`auth.router.ts`（`/api/auth/*`）、`auth.middleware.ts`（全局认证门）、`index.ts` barrel。
- 凭证模型（决策①②）：单一共享密钥 `AUTH_TOKEN`（≥32 字符，建议 48+）。**生产缺失则启动即拒**（fail closed）；dev 未配置时认证整体跳过。
- Web 会话 Cookie `serenique_session`（决策③④）：格式 `exp.signature`，`signature = HMAC-SHA256(AUTH_TOKEN, "serenique-session."+exp)`（复用 blob `signBlobAccess` 模式）；HttpOnly + SameSite（生产 `None` / dev `Lax`）+ Secure（生产）+ `Max-Age=SESSION_TTL`；无状态、不查库。
- 防爆破（决策⑦）：login 失败 sleep 500ms；同 IP 短窗 ≥5 次失败 → 429 封禁 10 分钟（单进程内存 Map）。
- 错误码：`shared/errors.ts` 新增 `UNAUTHORIZED`、`RATE_LIMITED`；401 / 429 用户文案中文。
- 中间件放行列表：`/health`、`/`、`/api/auth/login`、`/api/auth/logout`、签名 blob 文件链接（`/api/blobs/:id/file?expires=&signature=`）。
- `env.ts` 新增 `AUTH_TOKEN`（min 32 optional）、`SESSION_TTL`（optional，service 回退默认 30 天）；`app.ts` 挂 auth 中间件 + authRouter；CORS 支持凭证（`CORS_ORIGIN`）。
- **零迁移**：无新表（不建 users / sessions 表）。

**Web（apps/web）**
- `/login` 页 + AuthGuard + 退出按钮；请求统一 `credentials:"include"`；不存 localStorage；`GET /api/auth/me` 驱动登录态（TanStack Query）。
- 媒体加载改走签名 blob 链接（跨站 Cookie 场景）。

**CLI（apps/cli）**
- `auth login`（打码写 config）/ `auth logout` / `auth me`；client 自动带 `Authorization: Bearer`。

**MCP（services/mcp）**
- streamable-http 传输加同密钥 Bearer 校验（compose 共用根 `.env`）；内部 service 直连不受 API HTTP 认证影响。

**部署配置与文档**
- `.env.example`：补 `AUTH_TOKEN`、`SESSION_TTL`。
- `docker-compose.yml`：api 服务加 `AUTH_TOKEN`（fail-closed `${AUTH_TOKEN:?}`）、`SESSION_TTL`、`CORS_ORIGIN`；mcp 服务加 `AUTH_TOKEN`。
- `CLAUDE.md`：env 行补 `AUTH_TOKEN` / `SESSION_TTL`、API 路由表加三行 auth 路由、新增「认证（Auth）」节。
- 本 worklog。

## 验证

- API：`bun run typecheck` ✓；`bun test` **92 pass / 0 fail** ✓（159 tests / 18 files，含 auth domain / service 单测与 app.test 中间件用例；67 skip 为 `RUN_DB_TESTS=1` 才跑的集成测试）。
- Web：`bun run typecheck` ✓；`bun run test`（vitest）**33 files / 119 tests 全绿** ✓。
- CLI：`go build ./...` ✓、`go vet ./...` ✓、`go test -count=1 ./...` 全绿 ✓。
- MCP：`bun run --cwd services/mcp test` **7 pass** ✓。
- 根 `bun run typecheck`（api + mcp + web）✓。
- `docker compose config`：带 `AUTH_TOKEN` 校验通过（api / mcp 均注入；`SESSION_TTL` 默认 2592000、`CORS_ORIGIN` 空默认）；**不带 `AUTH_TOKEN` 报错 fail-closed** ✓。

## 部署步骤

1. **上线前先在根 `.env` 配好三个变量再重启**（生产缺 `AUTH_TOKEN` 启动即失败）：
   - `AUTH_TOKEN`：≥32 字符高熵随机值（如 `openssl rand -base64 48`），所有端共用。
   - `BLOB_SIGNING_SECRET`：Web 媒体已改走签名链接，需同密钥；dev 未配时回退直链。
   - `CORS_ORIGIN`：Web 域名（如 `https://serenique-web.pages.dev`）。
2. `docker compose up -d --build api mcp`。
3. 发布走「推 main → 打 tag」。

## 对下一次会话的提示（pitfalls）

1. **生产 `AUTH_TOKEN` 缺失会启动失败（fail-closed）**：先配 `.env` 再 `docker compose up -d`；`docker compose config` 在缺该变量时直接报 `required variable AUTH_TOKEN is missing a value`（`${AUTH_TOKEN:?}` 是故意的）。
2. **`CORS_ORIGIN` 必须设为 Web 域名**：带凭证（Cookie）跨域不允许 `*`；未设或设错时浏览器会拦截带 Cookie 的登录/请求。
3. **媒体加载依赖 `BLOB_SIGNING_SECRET`**：Web 已改走签名 blob 链接（跨站 Cookie 场景直链会被认证挡住）；dev 未配该密钥时回退直链。
4. **换密钥 = 全端失效**：改 `.env` 的 `AUTH_TOKEN` 并重启后，旧会话 Cookie 与旧 Bearer 全部失效；无会话表 / 无 users 表可清，属设计预期。
5. **本地不带认证跑**：compose 场景把 `${AUTH_TOKEN:?}` 改成 `${AUTH_TOKEN:-}`（生产必须带值）；dev 直接 `bun run dev` 不设 `AUTH_TOKEN` 即跳过认证（零摩擦）。
6. **dev 未配置 `AUTH_TOKEN` 时 login 返回 200 但不发会话 Cookie**：`createSessionCookie()` 在密钥为 undefined 时会因 `createHmac` 抛错 → 500，handler 有意只在 auth 启用时发 cookie。
