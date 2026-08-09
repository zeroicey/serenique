# 2026-08-09 — API 认证重构：共享密钥 AUTH_TOKEN → Passkey (WebAuthn) + API Token + 个人信息

按 `.ai/requirements/2026-08-09-passkey-auth.md` 全量重写 `services/api` 认证体系（决策①②④⑤⑥⑦⑧ 全部落实）。旧方案（`2026-08-06-auth.md`）退役。

## 改动清单

**迁移（1 个）**：`drizzle/0014_rapid_stone_men.sql`（drizzle-kit generate 生成）
- `users`（id/name/email/birthday/时间戳，单行语义）
- `passkey_credentials`（user_id FK 级联、credential_id UNIQUE、public_key 存 COSE bytes base64url、transports jsonb、counter bigint、last_used_at；user_id 索引）
- `api_tokens`（name、token_hash UNIQUE SHA-256 hex、prefix、last_used_at、revoked_at）

**auth 模块重写（`src/modules/auth/`）**
- `auth.schema.ts`（新）：users + passkeyCredentials 表定义
- `auth.domain.ts`：cookie 签名载荷从「仅过期时间」扩为 `exp.userId.sig`（userId 进 HMAC 内容）；`verifySessionCookie` 返回 `{valid, userId}`；新增 `evaluateRegisterGate`（users 空表 + SETUP_TOKEN 常量时间比对 / 已有用户需会话，纯函数）；节流纯函数保留
- `auth.types.ts`：RegisterStart/Finish、LoginFinish（credential JSON 信封校验）、UpdateUserProfile（`""`→null、DateOnlySchema）、UserEntry/CredentialEntry
- `auth.mappers.ts`（新）、`auth.service.ts`（challenge 内存 Map 5 分钟一次性 + register/login ceremony + users/me + 凭证 CRUD + counter 严格校验 + 节流）、`auth.handler.ts`（Origin 白名单校验、Set-Cookie 组装）、`auth.middleware.ts`（重写：Bearer→api_tokens 查表 / cookie→验签取 userId；公开路由尽力解析会话供「加设备」用）、`auth.router.ts`（register/login/me/credentials/users/me）

**tokens 模块（`src/modules/tokens/`，8 文件）**：`serenique_` + 32B base64url 明文，只存 SHA-256 hex + prefix；verify 走中间件（revoked 即拒，last_used_at fire-and-forget）；revoke 软删（对已撤销 id 重复撤销 → 404）

**周边**：`env.ts`（删 AUTH_TOKEN；加 SESSION_SECRET/SETUP_TOKEN/WEBAUTHN_RP_ID/RP_NAME/ORIGINS）、`app.ts`（fail-closed 改 SESSION_SECRET+WEBAUTHN_RP_ID；挂 tokenRouter）、`exports.ts`（+auth/tokens 服务与 schema）、`audit.types/domain`（+auth.register、auth.credential_delete、token.create、token.revoke）、`src/test/helpers.ts`（TEST_SESSION_SECRET/TEST_SETUP_TOKEN/WEBAUTHN_* 默认值）、`src/test/webauthn.ts`（新：测试用 WebAuthn 模拟器）、根 `.env.example`、AGENTS.md（Auth 节 + 路由表 + Docker env）

## 验证

- `bun run typecheck` 通过
- `bun test`（单测）：**268 tests / 0 fail**
- `RUN_DB_TESTS=1 bun test`（全量含集成）：**250 pass / 0 fail**（跑 3 次稳定）
- 集成覆盖：完整 ceremony（注册→自动登录 cookie→users/me→加第二把凭证→login/start+finish→counter 回退 401→token 创建/Bearer/撤销→签名 blob 链接公开→logout）、审计写点（auth.login/login_failed/register/credential_delete、token.create/revoke）

## @simplewebauthn/server 13.3.2 在 Bun 上的验证结论

**可用，无需替代品**。import + 类型检查 + 全 ceremony 跑通。几个关键点（全是坑）：

1. `expectedChallenge` 参数必须传 **base64url 编码后的 challenge**（`isoBase64URL.fromUTF8String(record.challenge)`）：库对 `clientDataJSON.challenge`（浏览器原样回传的 options.challenge 值）做字符串直比；而 `generateRegistrationOptions` 对 string challenge 会先 utf8→base64url 再放进 options.challenge。JSDoc 写的就是 "base64url-encoded options.challenge"。
2. **ECDSA 签名必须 DER 编码**（ASN.1 SEQUENCE{INTEGER r, INTEGER s}）：`unwrapEC2Signature` 无条件走 asn1js 解析 DER；WebCrypto 输出的 64 字节 raw R||S 直接传会报 `Too big integer`（asn1js 的报错，毫无栈线索）。测试模拟器里写了 `rawRSToDER`。
3. 库自身也做 counter 单调校验（`counter <= credential.counter` 时抛错），但报的是通用错误——服务里在调 verify 前先用 `parseAuthenticatorData` 解析 signCount 做前置校验，审计消息才能区分「计数器未递增（克隆嫌疑）」。
4. `isoCBOR`/`isoUint8Array`/`parseAuthenticatorData` 从 `@simplewebauthn/server/helpers` 导入（root 不导出）；`AuthenticatorTransport` 类型从 root 导入，取值 **不含 "smart-card"**（zod enum 对齐过）。
5. 无 `testing` 子路径、无独立 `@simplewebauthn/testing` 包 → 集成测试自建模拟器（`src/test/webauthn.ts`：WebCrypto P-256 + fmt "none" attestation + DER 签名 + clientDataJSON 按真实浏览器语义构造）。

## 坑 / 对下一次会话的提示（重要）

1. **bun test 单进程共享模块状态 + mock.module 会跨文件泄漏**：`bun test` 所有文件跑在同一个进程（top-level 交错执行），`mock.module` 的「文件级隔离」并不可靠（实测泄漏到其他文件导致 token 集成测试拿到无 create 的 mock）。**结论：app.test 这类 DB-free smoke 测试不要 mock 模块**——改用手工铸造的会话 cookie（`authService.createSessionCookie(userId)` 是纯 HMAC，不碰 DB），中间件 cookie 分支只验签，天然 DB-free。
2. **@/env 先 import 先赢**：所有测试文件必须 setTestEnv 同样的默认值；任何文件想「关认证」都会和别的文件竞态（实测 auth.service.test 因 app.test 删除 WEBAUTHN_RP_ID 而误判 isAuthEnabled=false）。统一默认 `WEBAUTHN_RP_ID=localhost`（认证启用）。
3. **无状态会话 cookie 的 logout 语义**：logout 只是客户端清 cookie + 服务端下发 Max-Age=0；旧 cookie 值服务端仍验签通过（换 SESSION_SECRET 才全端失效）。集成测试不要断言「logout 后旧 cookie 401」。
4. **修了一个既有测试债**：`tag.service.test.ts` 的注册表用例把 no-op validator `registerOwnerValidator("diary", ...)` 永久写进模块级 Map，全量跑（单进程）会让 tag 集成测试的「diary 应 400」断言失效（前一个 worklog 已记录此坑）。本次给 `tag.domain.ts` 加了 `unregisterOwnerValidator` 并在用例内清理——**bun test 单进程意味着任何模块级可变状态的测试用例都必须自清理**。
5. **Web/CLI 契约变化**（后续 Web/CLI agent 必读）：`POST /api/auth/login`（旧共享密钥）已删除 → 404；登录/注册改为 `register/start|finish` + `login/start|finish` 双段 ceremony（body 含 WebAuthn credential JSON + `challengeId`）；`/api/auth/me` 新形状 `{ authenticated, user: {id,name,email,birthday} | null }`；新增 `/api/users/me`、`/api/auth/credentials`、`/api/tokens`（明文仅创建响应返回一次）。origin 白名单 `WEBAUTHN_ORIGINS` 决定 ceremony 合法来源。
6. **prefix 语义**：api_tokens.prefix 存的是**随机段前 8 位**（`serenique_` 品牌前缀恒定，随机段才是身份信息）——需求文档「明文前 8 位」按用途（列表识别）解释执行，CLI/Web 展示时注意。
7. **SETUP_TOKEN 不做生产 fail-closed**（需求 ⑦ 明确「注册完成后可从 env 移除」）；fail-closed 只查 SESSION_SECRET + WEBAUTHN_RP_ID。
