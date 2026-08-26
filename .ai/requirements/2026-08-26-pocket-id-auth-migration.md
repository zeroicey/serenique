# 认证中心迁移：接入 Pocket ID（auth.zeroicey.me）需求评估

- 日期：2026-08-26（决策定稿同日；Phase 1 同日实施 + 部署 + 验收）
- 状态：✅已实施（Web 端 OIDC 登录全量上线并端到端验收通过 2026-08-26；双子代理 code review ship-safe；Mobile/CLI 改造与 Phase 3 清理待后续）

## 已定决策（2026-08-26，用户拍板）

1. **范围**：Phase 1 只做 API + Web；API token 机制保留不废弃（Mobile/CLI 存量客户端零影响）；移动端改造等 Web 验收后另起 phase。
2. **用户映射**：映射到现有 users 行（users 加可空唯一 `oidc_sub` 列，首次 OIDC 登录自动绑定）；个人信息以认证中心为准，本地只留附加字段。
3. **旧 Passkey 入口直接删**：API ceremony 端点、Web webauthn.ts/setup-page 同版本移除，不做并存过渡；`passkey_credentials` 表暂留（Phase 3 归档）。
4. **会话有效期**：30 天 → **3 天**（SESSION_TTL=259200）。
5. **登出**：仅清 Serenique 本地会话，不联动 IdP end_session_endpoint。
6. **密钥管理**：client_id/client_secret 由用户填入 `.secrets/pocket-id.env`（已 gitignore），绝不入库/进日志。
7. **Pocket ID client 配置**（2026-08-26 定稿）：机密客户端（非 public，secret 只存服务器 .env，token 交换在 API 后端完成）+ 开启 PKCE + 开启 skip consent（自家第一方可信客户端）+ 不要求每次重新认证；Launch URL `https://serenique.0icey.icu`；Logout URL 留空（决策 5）。

- 范围：`services/api`（auth 模块）、`apps/web`（登录页）、`apps/mobile`（登录页，可选增强）、`apps/cli`（可选增强）
- 前置记录：`2026-08-09-passkey-auth.md`（✅已实施的自研 Passkey 方案，拟被本方案替换）、`2026-08-06-auth.md`（🪦更早的共享密钥方案）、`2026-08-15-face-verification-auth.md`（🪦已否决）

---

## 1. 背景与动机

自研 Passkey 方案（v0.5.0 上线）暴露四类问题：

1. **安全性存疑**：challenge 存单进程内存 Map、session 是自制 HMAC cookie、门禁/节流逻辑全部自己维护。
2. **兼容性差**：iOS 免费开发者账号（Personal Team）不支持 Associated Domains capability → 移动端 App 内 Passkey 无法真机构建（`2026-08-09-flutter-passkey-auth-design.md` 已回退），移动端退化为「Web 端建 token → 手动粘贴」。
3. **维护成本**：`@simplewebauthn/server` ceremony + 三表模型 + 引导脚本 + fail-closed 启动检查，全栈自持。
4. **Apple 设备体验问题**：自有 RP ID 域名下 passkey 注册/认证在用户 Apple 设备上不顺。

内网中心已部署统一认证中心 **Pocket ID v2**（2.14.0），定位是全系统唯一 OIDC IdP，registry 与 serenique 登录一律委托给它。运维文档见 hpcore ops 仓库 `runbooks/pocket-id.md`。

## 2. 认证中心现状（实测 2026-08-26）

| 项 | 值 |
| --- | --- |
| Issuer | `https://auth.zeroicey.me` |
| 发现文档 | `https://auth.zeroicey.me/.well-known/openid-configuration`（已实测可访问） |
| 链路 | hpazure Caddy (443) → Tailscale → hpcore `100.64.0.1:1411`（仅绑 Tailscale IP） |
| 数据 | SQLite 单文件 + ENCRYPTION_KEY（备份需两者一起） |

**线上 discovery 实测能力面（权威，高于上游文档描述）**：

- grant types: `authorization_code`、`refresh_token`、**`urn:ietf:params:oauth:grant-type:device_code`（RFC 8628 device flow）**、**`client_credentials`（M2M）**
- scopes: `openid profile email groups offline_access`
- PKCE：`plain` + `S256`；签名 RS256（JWKS）；支持 PAR、introspection、`end_session_endpoint`

即 ops 文档「应用接入指南」之外，还有 **device flow（CLI 理想方案）与 client_credentials（机器对机器）两个玩法**。

## 3. 我方现状盘点

| 端 | 当前认证形态 | 迁移影响 |
| --- | --- | --- |
| Web | Passkey ceremony + HMAC session cookie | **主改造点**：登录页换 OIDC 重定向 + `/callback` |
| API | `@simplewebauthn/server` ceremony、内存 challenge、HMAC cookie、SETUP_TOKEN 门禁、bootstrap-user 引导脚本、fail-closed 启动 | 删 WebAuthn 全套；新增 OIDC 回调端点；session 形态可保留 |
| Mobile (Flutter) | **粘贴 API token**（secure_storage 存储），不用 Passkey | 已装机的存量客户端**零改动可用**；可选增强走 OIDC PKCE |
| CLI | config 文件 Bearer token（flag/env/file 三级 resolve） | 已发布二进制零改动可用；可选增强走 device flow |

关键事实：**除 Web 外，所有客户端早已是「API token 管」模式**——这正好与 ops 文档第 3 节「两层凭证」设计吻合：认证中心管人，API token 管机器。

## 4. 核心疑问解答

### Q1：移动端免费账号没有 Associated Domains，Pocket ID 方案是不是也不行？

**可行，且恰好绕开了这个限制。**

- 之前的失败根因：App 内直接跑 WebAuthn ceremony 需要 `webcredentials:<RP ID>` Associated Domains 权限，Personal Team 不给。
- Pocket ID 方案里，**Passkey ceremony 发生在系统浏览器的 auth.zeroicey.me 页面**，RP ID 是 Pocket ID 自己的域名，与我们 App 的 entitlement 无关。App 只负责拉起浏览器和接回调。
- 回调方式：自定义 URL scheme（如 `serenique://auth/callback`）。Custom scheme 不需要付费开发者账号（区别于 Universal Links / Associated Domains），免费签名装机即可用。
- iOS 用 `ASWebAuthenticationSession`（系统级独立浏览器会话，非 webview，符合 Pocket ID 要求）；Android 用 Custom Tabs。

结论：**不需要走纯 Token 兜底路线，也不需要付费开发者账号。** 已装机存量客户端继续用粘贴 token 也完全不受影响。

### Q2：Pocket ID 有什么别的玩法？

1. **Device flow（RFC 8628）**：CLI/无浏览器设备场景的官方姿势——CLI 显示一个 code + URL，用户在任意有 passkey 的设备上完成确认。比现在「去 Web 设置页手动建 token 再粘贴进 CLI」顺滑得多。
2. **client_credentials**：M2M 场景（如未来脚本/自动化直连 API），但注意 Pocket ID 官方明确其 API Key 不要当业务 token 用；serenique 业务侧仍以自签 API token 为准。
3. **groups scope**：单用户系统暂时用不上，但为未来多用户/角色留了标准扩展点。
4. **offline_access + refresh_token**：移动端 OIDC 化后可静默续期，「很久登一次」。

## 5. 推荐架构（待讨论定稿）

采用 ops 文档建议的**两层凭证 + broker 会话**：

```text
登录(人)   : Web/Mobile/CLI ──OIDC──> auth.zeroicey.me（Passkey 在那边按）
会话/API   : serenique 自发 session cookie(Web) + serenique_ API token(Mobile/CLI) —— 机制不变
```

- **API**：删掉整个 WebAuthn 面（ceremony、内存 challenge、SETUP_TOKEN 门禁、bootstrap-user、fail-closed users 检查）；新增 `/auth/oidc/callback`（code 换 token、JWKS 验签、取 sub/email 映射本地 user 行）→ 发原有 HMAC session cookie。**session/token 鉴权中间件不动**，业务模块零感知。
- **users 表**：保留（个人信息仍是业务数据），增加 `oidc_sub` 映射列；首次登录自动 upsert。
- **tokens 表与鉴权中间件**：原样保留；token 创建入口从「Passkey 会话」变为「OIDC 会话」，语义不变。
- **Web**：登录页改为一键跳转认证中心；删除 setup-page / webauthn.ts。
- **Mobile**（phase 2 可选）：加 OIDC PKCE 登录按钮（ASWebAuthenticationSession + custom scheme），存量 token 粘贴入口保留兜底。
- **CLI**（phase 2 可选）：`serenique auth login` 加 device flow，替代手动粘贴 token。

## 6. 注意点与限制（讨论清单）

1. **Pocket ID 本身也是 Passkey-only**：它解决的是「实现维护 + RP ID 域名正确性 + 标准化」，不是「绕开 Passkey」。若用户 Apple 设备上 passkey 本身不可用（非域名/权限问题），Pocket ID 同样按不了。缓解：跨设备扫码确认（QR → 另一台有 passkey 的设备批准）；上游仓库存在 `one_time_access_token` 能力痕迹（v2 有一次性访问令牌命令，可作应急通道，细节待验证）。→ **实施前先在真机浏览器试一次 auth.zeroicey.me 登录体验**。
2. **单点故障**：auth.zeroicey.me 挂了 = 不能新登录/重登。已有 session cookie 与 API token 不受影响（我们自发自发校验）。hpazure Caddy 是公网链路必经点。
3. **RP ID 迁移成本**：现有 passkey 绑死 `serenique.0icey.icu`，迁到 Pocket ID 后旧凭证全部作废——反正要重登一次，属预期。
4. **环境变量收敛**：`WEBAUTHN_*`、`SETUP_TOKEN` 退役；新增 `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`（或 client_secret_post）；`SESSION_SECRET` 保留。fail-closed 启动断言需要重新设计（users 空表语义变化）。
5. **回调域名约束**：Web callback 需在 Pocket ID 后台注册精确 URL；生产 `serenique.0icey.icu` 与本地 dev `localhost` 各注册一条。Mobile custom scheme、CLI loopback (`http://localhost:<port>` 或 device flow) 也要注册。
6. **审计模块衔接**：audit 里 passkey 相关事件类型要换成 oidc_login 语义。
7. **测试两档约定**：auth.service.test.ts 纯函数档照写（JWT 验签逻辑 mock 时钟/JWKS）；integration 档注意 OIDC 流程依赖外网 issuer，需用本地 wiremock 或注入 JWKS 公钥。
8. **exports.ts 导出面**：auth 相关 schema 若被 `.extend()`/`.shape` 引用，改动前核对契约锚定规则。

## 7. 分期建议（未排期）

- **Phase 1（核心）**：API OIDC 回调 + Web 登录切换 + 删 WebAuthn 面 + Pocket ID 后台注册 client。完成后 Web 全量走认证中心，Mobile/CLI 存量不受影响。
- **Phase 2（体验）**：Mobile OIDC PKCE 按钮；CLI device flow。
- **Phase 3（清理）**：退役 `WEBAUTHN_*` env、setup-page 残留、passkey_credentials 表归档迁移。
