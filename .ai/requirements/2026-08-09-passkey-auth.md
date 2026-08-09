# Passkey 认证重构需求文档

- 日期：2026-08-09
- 状态：✅已实施（API 侧 2026-08-09 完成：auth 模块重写 + users/passkey_credentials/api_tokens 三表 + tokens 模块 + WebAuthn ceremony 集成测试全绿；Web 侧同日完成：登录页 Passkey ceremony + 设置页凭证/Token 管理，见 `.ai/worklog/2026-08-09-passkey-auth-api.md` / `2026-08-09-passkey-auth-web.md`；CLI token 模式 / 移动端为后续 phase）
- 范围：`services/api`（重写 auth 模块 + 新增 users/credentials/api_tokens 表）、Web（登录页换 WebAuthn + token 管理页）、CLI（改 API token 凭证）、移动端 Flutter（规划）；MCP 冻结不受影响
- 前置记录：`2026-08-06-auth.md`（旧共享密钥方案，已被本方案替换）、`2026-08-08-mcp-sunset.md`

---

## 1. 背景与目标

现有认证是**固定共享密钥**（`AUTH_TOKEN`）+ 无状态 HMAC cookie（见 `2026-08-06-auth.md`）。用户认为不够安全，改为**标准 Passkey（WebAuthn）**，并顺带引入个人信息存储。

约束：

- **单用户**：部署者本人；无多账号 / 多租户 / 角色语义。
- **多设备**：同一个人的私钥可能同时存在 Apple（iCloud Keychain / Face ID）、Google（Google Password Manager / Android）、Microsoft（Windows Hello）等平台的通行密钥管理器里，**跨设备可用**。
- **标准架构**：不发明轮子，走标准 WebAuthn ceremony（navigator.credentials.create / get）。

---

## 2. 数据模型（设计方向）

新增三张表（详见「已定决策」①②④）：

### `users` — 用户（单行）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | 稳定主键，credential 的外键目标 |
| name | text | 名字 |
| email | text | 邮箱 |
| birthday | date（可空） | 生日 |
| created_at / updated_at | timestamptz | 时间戳 |

个人信息：名字 / 邮箱 / 生日等。单用户实际只有一行。

### `passkey_credentials` — 通行密钥凭证

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → users.id | 归属 |
| credential_id | text UNIQUE | WebAuthn credential ID（base64url） |
| public_key | text | 公钥（COSE → PEM 或原始 bytes 存储，实现时定） |
| transports | jsonb | 平台支持的认证器传输方式（usb/nfc/ble/internal） |
| device_label | text | 人类可读标签（如「MacBook · Apple」） |
| counter | bigint | 登录计数器（防克隆，可选严格校验） |
| last_used_at | timestamptz 可空 | 最近使用时间 |
| created_at | timestamptz | |

### `api_tokens` — CLI/脚本访问令牌（GitHub PAT 模式）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| name | text | 人类可读标签（如 `macbook` / `server`） |
| token_hash | text UNIQUE | **只存 SHA-256 hash，不存明文** |
| prefix | text | 明文前 8 位，用于列表展示识别 |
| last_used_at | timestamptz 可空 | 最近使用时间 |
| revoked_at | timestamptz 可空 | 撤销时间；非空即失效 |
| created_at | timestamptz | |

## 3. 业务规则

- **注册（引导期）**：`POST /api/auth/register/start` + `/register/finish` 仅作**引导/加设备**用，不再面向公开 UI：`passkey_credentials` 计数为 0 时需携带 `SETUP_TOKEN`（常量时间比对）→ 首次凭证 ceremony；凭证 ≥1 后仅登录态可调（添加新设备，同一接口）。**登录页无任何注册表单/入口**。
- **用户创建 = 引导脚本**：`users` 表为空时后端**启动 fail-closed**（auth 启用时），报错提示先运行 `bun scripts/bootstrap-user.ts`（幂等，从参数/env 读 name/email/birthday 创建首行）。**前端没有「创建用户/注册」概念**。
- **登录**：`POST /api/auth/login/start`（生成 challenge）+ `/login/finish`（get ceremony，校验签名 + counter）→ 签发会话。
- **challenge**：短时效（如 5 分钟）、一次性、单进程内存即可（个人服务无需多节点协调）。
- **凭据列表管理**：`GET /api/auth/credentials`（列表）、`DELETE /api/auth/credentials/:id`（移除某设备，需会话已登录）。**新增设备凭证 = 登录状态下再走一次 create ceremony**（与首次注册复用同一接口，由门禁区分）。
- **会话沿用**：现有 HMAC 无状态 cookie（`serenique_session`）机制保留，签名密钥改用独立 **`SESSION_SECRET`** env（`AUTH_TOKEN` 退役后不能继续用它签 cookie）。
- **RP ID**：WebAuthn ceremony 发生在前端页面 origin 上（`serenique-web.pages.dev`），**RP ID = 前端域名，不是 API 域名**；新增 `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGINS` env。⚠️ 换前端域名 = 旧 passkey 全部失效。
- **CLI/机器访问 = 可管理 API Token**：`POST /api/tokens` 创建（明文仅返回一次）→ CLI 存到本地配置；泄露后 `DELETE /api/tokens/:id` 单独撤销，不影响其他端。
- **token 校验**：中间件 Bearer → 查 `api_tokens` 表（SHA-256 比对，revoked_at 非空即拒绝）。**明文不落库、不出现在列表响应**。
- **`AUTH_TOKEN` 退役**：删除 `.env` 中 `AUTH_TOKEN`；新增 **`SETUP_TOKEN`**（部署时随机生成，仅引导注册用，注册完成后可从 env 移除）+ **`SESSION_SECRET`**（cookie 签名）+ **`WEBAUTHN_RP_ID`/`RP_NAME`/`ORIGINS`**。生产 fail-closed：缺 `SESSION_SECRET` / `WEBAUTHN_RP_ID` 拒绝启动。
- **dev 零摩擦保留**：未配置 `WEBAUTHN_RP_ID` 时认证整体跳过（local 同现行为）；localhost 属 secure context，配好 RP_ID 也可完整走 ceremony。
- **防爆破**：login/finish 失败节流沿用现有内存节流模式。
- **个人信息**：`GET/PUT /api/users/me`（读 / 改自己的资料）。
- **移动端**：Passkey 平台级可用（iOS 16+ / Android 9+，Flutter 插件选型 **corbado `passkeys`** 包），服务端同一套标准 ceremony；原生 app 与 web **共享** passkey 需域名关联文件（`apple-app-site-association` / `assetlinks.json` 托管在 RP ID 域 `.well-known/`）。⚠️ **服务端两处必须配合，非零改动**：① `expectedOrigin` 需支持数组（Web/iOS = `https://serenique-web.pages.dev`；**Android = `android:apk-key-hash:<指纹>`** 非 URL 格式，`WEBAUTHN_ORIGINS` 需容纳）；② **counter 宽松校验**（同步型 passkey counter 恒 0）。会话为 HttpOnly cookie，Flutter 需 cookie jar 持久化或响应体返 token；备选方案为移动端直接用 API token（与 CLI 相同）。完整调研与实施清单见 `worklog/2026-08-09-passkey-flutter-research.md`。
- 用户可见文案中文。

## 4. API 路由（设计方向）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register/start` | WebAuthn 注册开始（生成 challenge + 可选 user 信息） |
| POST | `/api/auth/register/finish` | 注册完成（校验 attestation → 存凭证 → 自动登录） |
| POST | `/api/auth/login/start` | 登录开始（生成 challenge，返回可用的 credentialId 列表） |
| POST | `/api/auth/login/finish` | 登录完成（校验签名 + counter → 发会话 cookie） |
| POST | `/api/auth/logout` | 清 cookie（保留） |
| GET | `/api/auth/me` | 会话状态 + 用户信息（扩展现有） |
| GET | `/api/auth/credentials` | 已注册凭证列表（需登录） |
| DELETE | `/api/auth/credentials/:id` | 删除凭证（需登录） |
| GET/PUT | `/api/users/me` | 个人信息读取 / 更新（需登录） |
| POST | `/api/tokens` | 创建 API token（需登录；明文仅返回一次） |
| GET | `/api/tokens` | 列表（仅 prefix/name/时间，无明文） |
| DELETE | `/api/tokens/:id` | 撤销 token（需登录） |

## 5. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | users 表 | **建 `users` 表**（单行）；credential 的 FK 归属锚点 ✅已确认 |
| ② | 方案 | 标准 WebAuthn（Passkey），不发明轮子 |
| ③ | 多设备 | 允许多把凭证共存（Apple / Google / Microsoft 各存一把） |
| ④ | CLI 认证 | **可管理 API Token**（GitHub PAT 模式），单独创建/撤销；`AUTH_TOKEN` 退役 ✅已确认 |
| ⑤ | challenge 存储 | 单进程内存，短时效一次性（个人服务够用） |
| ⑥ | 会话 | 沿用现有 HMAC 无状态 cookie，签名密钥改用独立 `SESSION_SECRET` |
| ⑦ | 注册门禁 | **`SETUP_TOKEN` 引导制**：凭证计数=0 时携带 SETUP_TOKEN 才允许首次凭证 ceremony；凭证 ≥1 后仅登录态加设备 ✅已确认 |
| ⑧ | 移动端 | **也走 Passkey**（规划，08-09 已调研落盘）：插件选 corbado `passkeys`（iOS 16+ / Android 9+）；共享凭证靠 RP ID 域托管 AASA + assetlinks.json；**服务端需配合 expectedOrigin 数组（含 Android `apk-key-hash` origin）+ counter 宽松校验**；Android 需 `FlutterFragmentActivity`；实施清单见 `worklog/2026-08-09-passkey-flutter-research.md` ✅已确认 |
| ⑨ | 公开首次注册 | **移除**：users 由引导脚本 `bootstrap-user.ts` 创建（幂等，参数/env 读 name/email/birthday）；auth 启用且 users 空表 → 启动 fail-closed；前端只有隐藏 `/setup?setupToken=` 页创建首个凭证；登录页只留通行密钥登录；`userInfo` 字段从 register/start 移除 ✅已确认 |

---

## 6. 实施路线（初步）

1. 清理：删除现有 auth 模块实现（保留 `auth.domain.ts` 的 cookie 签名 / 节流纯函数，改造复用）；schema 加 users / passkey_credentials / api_tokens 迁移。✅（a3409f4）
2. WebAuthn 服务端：challenge 签发 + 校验（使用 `@simplewebauthn/server`，Bun 兼容性需验证）。✅（a3409f4）
3. 路由 + 中间件改造：身份来源改为会话中的 user_id；Bearer 分支改为查 `api_tokens` 表。✅（a3409f4）
4. tokens 模块：CRUD + 撤销（明文仅创建时返回一次）。✅（a3409f4）
5. Web 登录页：navigator.credentials 流程 + 凭证管理 UI + token 管理页。✅（Web 3 commits）
6. CLI：改 token 模式（`auth login` 走粘贴 token / 浏览器流程）。✅（8026efa）
7. 部署 v0.5.0 + 生产验证。✅（22857dc，见 `worklog/2026-08-09-passkey-prod-deploy.md`）
8. **移除公开首次注册**（决策⑨）：引导脚本 + 启动 fail-closed + 隐藏 setup 页 + 登录页去注册表单。← 本次
9. 移动端（后续 phase）：Passkey 插件 + 域名关联文件，服务端配合 expectedOrigin 数组等。
