# 2026-08-09 — CLI 认证改造：共享密钥 AUTH_TOKEN → 可管理 API Token（GitHub PAT 模式）

按 `.ai/requirements/2026-08-09-passkey-auth.md` 决策④ 把 `apps/cli` 的认证从「共享密钥 AUTH_TOKEN Bearer」改为「可管理 API Token」。API 侧已完成（见 `.ai/worklog/2026-08-09-passkey-auth-api.md`），本次只动 CLI + 根文档清理。

## 改动清单

**`apps/cli/internal/client/`（新契约类型化方法）**
- `auth.go`（新）：`UserEntry` / `AuthMeEntry`（`json` 标签对齐 API `auth.types.ts`，name/email/birthday 用 `*string` 承载 null）+ `Client.Me()`（GET /api/auth/me，auth login 探测与 auth me 共用）
- `token.go`（新）：`TokenEntry` / `TokenCreateResult` + `Client.CreateToken/ListTokens/RevokeToken`；`TokenBrandPrefix = "serenique_"`（tokenListPrefix 复刻 prefixOf 用）

**`apps/cli/cmd/`**
- `auth.go` 重写：`auth login` = 交互式粘贴或 `--token` 直传 → 用候选 Token 探测 `/api/auth/me`（200=有效，401=无效提示）→ 写入 config（沿用 0600 + maskToken）；不再调用旧 `/api/auth/login`。`auth logout` = 本地清除；可选 `--revoke` 按前缀匹配服务端令牌并撤销（0 匹配 → 提示后仅清本地；多匹配 → 报错不删本地）。`auth me` = 新形状展示用户信息（未设置显示 `-`），401 → 友好报错提示先 `auth login`
- `token.go`（新）：`token list`（表格：ID/前缀/名称/创建/最近使用/撤销时间，撤销与未使用显示 `-`；JSON 输出 items）、`token create <name>`（明文仅此一次：stderr 提示 + stdout 完整明文，**含 --json 模式**——这是打码约定的唯一例外，注释已说明）、`token revoke <id>`（确认后 DELETE，--force 跳过）
- `helpers.go`：新增 `isUnauthorized`（*APIError HTTPStatus==401）、`orDash`
- `root.go`：注册 `tokenCmd`；`--token` flag 文案改「API 令牌」
- `init.go` / `config.go` / `internal/config/config.go`：全部 AUTH_TOKEN/认证密钥 残留文案清理（prompt、help、字段注释）

**测试**
- `cmd/auth_test.go` 重写 + 扩展：login 写入/交互式 stdin/401 拒绝、logout 本地清除、logout --revoke 匹配撤销/无匹配仅清本地/多匹配报错且不删本地、auth me 用户信息/Token 身份/401 提示/JSON 透传、tokenListPrefix
- `cmd/token_test.go`（新）：create 明文一次性 + stderr 警告、create --json 完整明文（不 mask）、list 表格/空列表/JSON 解码、revoke EOF 取消不发请求/确认后 DELETE/--force
- `internal/client/auth_test.go` + `token_test.go`（新）：新形状解码（含 null→nil/""）、401 映射、DELETE 路径

**文档**
- `apps/cli/README.md`：新增「认证与 API Token」章节（含鸡生蛋说明：首次令牌需 Web 登录后创建），清理旧文案
- `CLAUDE.md` / `AGENTS.md`：Auth 节、路由表、env.ts 树、Docker env 中 AUTH_TOKEN 残留 → 新 passkey/token 模型

## 验证

- `go build ./... && go vet ./... && go test -count=1 ./...` 全绿（cmd / client / config / output 四包）
- 真机冒烟：起 mock API 跑通 auth login → auth me → token create --json → token list → token revoke → auth logout --revoke 全链路，stdout/stderr 分离正确（明文在 stdout、警告在 stderr）

## 契约偏离点（重要，报告给船长）

1. **`auth me` 对 API Token 身份永远拿不到用户资料**：API 的 me handler 只有会话 Cookie 身份（userId）才查 profile，Bearer 令牌身份返回 `{authenticated: false, user: null}`（HTTP 200）。CLI 按契约如实处理：表格模式显示「令牌有效（API Token 身份不返回用户信息）」，JSON 模式原样透传 `{authenticated, user}`。**用户信息展示路径（id/name/email/birthday）只在服务端给 user 对象时生效**——若需要 CLI 也显示用户资料，需 API 侧让 token 身份也能返回 profile（属 API 改动，超出本任务范围）。
2. **`auth logout --revoke` 按前缀匹配是近似匹配**：CLI 只存明文没有 token id，只能 `GET /api/tokens` 后按随机段前 8 位前缀匹配。同前缀多匹配 → 报错引导用 `token revoke <id>`（不自动撤销，避免误撤）。0 匹配（已撤销/不存在）→ 仅清本地并 stderr 提示，成功消息不谎称服务端已撤销。
3. **`token create` 明文不经过 maskToken**：设计如此（唯一拿到明文的机会），--json 模式也完整输出 `data.plaintext`，stderr 恒定提示「明文仅此一次」。

## 坑 / 对下一次会话的提示

1. **prefix 语义**：`api_tokens.prefix` 是「随机段前 8 位」（品牌前缀 `serenique_` 恒定无熵），不是明文整体前 8 位——CLI 的 `tokenListPrefix` 必须 `TrimPrefix("serenique_")` 后再取 8 位，否则永远匹配不上服务端列表。
2. **`/api/tokens` list 是无分页的裸 `{items}`**（无 total），不能复用 `paginatedListCommand`（它解析 `{items,total}`）；token list 单独写。revoked 令牌仍在列表中（revokedAt 非空），匹配撤销时需过滤 `revokedAt == ""`。
3. **token create 的 --json 是 maskToken 约定的唯一例外**——后续 reviewer 看到明文输出不要「修复」成打码，注释里已写明原因。
4. **`auth me` 的 200+authenticated:false 不是错误**：dev 认证关闭、或 Token 身份都会命中；只有 401 才是「未认证」。脚本判断登录态要看 HTTP 层（客户端已把 401 转成 error）。
5. 遗留的 AUTH_TOKEN 引用仅存在于历史文档（`.ai/requirements/2026-08-06-auth.md`、`docs/superpowers/*` 计划、`services/mcp` 冻结代码）——均为已取代/冻结的历史记录，按仓库惯例保留；`.ai/requirements/2026-08-08-push-module.md` 决策⑥「复用 AUTH_TOKEN」已随认证重构失效，该模块实施时需改用 API Token（API agent / 船长注意）。
