# Flutter 移动端 Passkey 接入设计（Mobile Passkey Auth Design）

- 日期：2026-08-09
- 状态：**已定稿**（队长与用户确认，进入实施计划）
- 范围：`apps/mobile`（Flutter）+ 服务端一个配置项 + Web 端两个 well-known 文件
- 前置记录：`2026-08-09-passkey-auth.md`（需求，✅已实施）、`2026-08-09-passkey-auth-api.md` / `passkey-auth-web.md` / `remove-public-first-registration.md` / `fix-apple-passkey-counter.md` / `fix-mobile-third-party-cookie.md`（worklog）、`2026-08-06-flutter-mobile-tech-stack.md`（技术栈）、`2026-08-07-flutter-mobile-auth-design.md`（旧共享密钥方案，**被本文档取代**）、`2026-08-09-passkey-flutter-research.md`（调研 worklog）

## 1. 背景与目标

后端认证已从共享密钥（`AUTH_TOKEN`）重构为 **Passkey (WebAuthn)** + API Token + 个人信息（v0.5.0 已全栈部署）。Web 端登录页/设置页已完成。本文档把移动端（`apps/mobile`）从「输入密钥」切换为 Passkey ceremony，镜像 Web 端的门禁探测、登录流程与设置页三 tab。

**两条用户机制（需求方明确）**：
- **(a) 用户添加**：部署时引导脚本 `bun scripts/bootstrap-user.ts` 创建唯一的 users 行；auth 启用 + users 空表 → API 拒绝启动（fail-closed）。**移动端没有任何「建用户」入口**。
- **(b) 通行密钥**：第一个 passkey 必须在浏览器打开前端地址 `/setup`（带引导令牌）创建（凭证计数 0 = 引导期，register/start 需 `SETUP_TOKEN`）；后续 passkey 在已登录的 Web/移动端「设置 → 登录凭证」里添加（凭证计数 ≥1 = 需会话，同一 register 接口）。

## 2. 已锁定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 插件 | **corbado `passkeys`**（`passkeys: ^2.22.1`），Android/iOS 一个 Dart API；服务端 options JSON 直接用 `RegisterRequestType.fromJsonString` / `AuthenticateRequestType.fromJsonString` 透传，**无需手写字段映射** |
| ② | 会话形态 | 服务端发 HttpOnly cookie（`serenique_session`）→ **移动端捕获 Set-Cookie 值存 `flutter_secure_storage`，请求头手动加 `Cookie:`**；不引 cookie jar 依赖（技术栈「第三方依赖从简」原则） |
| ③ | 登录页 | **门禁探测**（镜像 Web）：无参调 `register/start` → 403 = 引导期（显示首次设置提示 + 前端 `/setup` URL 指引）；401 = 已有凭证（通行密钥登录按钮）；网络/500 = 登录 + 错误提示 |
| ④ | 首次注册 | **严格按需求 (b)**：移动端不提供 SETUP_TOKEN 输入，首个 passkey 走浏览器 `/setup`；移动端只做提示引导 |
| ⑤ | 设置页 | 三 tab 镜像 Web：个人信息 / 登录凭证（列表+删除+添加设备+重命名）/ API 令牌（列表+创建+撤销，明文仅一次） |
| ⑥ | Origin 头 | 移动端 finish 请求必须带 `Origin` header（见 §3.2）：iOS = `https://<RP_ID>`；Android = `android:apk-key-hash:<指纹>` |
| ⑦ | 401 登出 | 沿用现有 `onUnauthorized` → 清本地 session → 跳登录页 |
| ⑧ | 登出 | 仅清本地 + 调 `POST /api/auth/logout`（best-effort）；服务端 cookie 无状态，本地清除即生效 |
| ⑨ | 错误翻译 | 镜像 Web `webauthn.ts`：NotAllowedError →「已取消或没有可用的通行密钥」等中文；ApiError 透传 |
| ⑩ | transports 位置 | 插件注册响应把 `transports` 放在 `response.transports`，服务端 schema 期望**顶层** `transports` → 移动端 finish 时映射到顶层（Zod 对未知键是剥离，不映射也不报错，但会丢 transports 元数据） |

## 3. 前置条件（实施前必须完成，非移动端代码）

### 3.1 域名关联文件（Web 端部署，与移动端共用 RP ID 域）

passkey 按 RP ID 存于 iCloud Keychain / Google Password Manager，App 与浏览器**共享**，前提是关联文件就位（都托管在 `https://<RP_ID>/.well-known/`，即 Web 前端域，与 `WEBAUTHN_RP_ID` 一致；换域名 = 全部 passkey 失效）：

| 文件 | 内容要点 | 依赖移动端提供 |
|------|---------|--------------|
| `apple-app-site-association` | `{"webcredentials":{"apps":["<TEAMID>.<bundleID>"]}}` | iOS bundle ID（如 `com.zeroicey.serenique`）+ Team ID；已通过免费签名在 iPhone 15 Pro 跑通，Team ID 用 Xcode 里的实际值 |
| `assetlinks.json` | `delegate_permission/common.get_login_creds` + 包名 + **debug/release/Play App Signing 全部 SHA-256 指纹** | Android 包名 + `keytool -list -v` 指纹（Android SDK 未装，可先只做 iOS，Android 指纹后补） |

### 3.2 服务端 `WEBAUTHN_ORIGINS` 追加 Android origin（唯一服务端改动）

服务端 origin 校验（`auth.handler.ts`）：finish 请求带 `Origin` header 且 ∈ `WEBAUTHN_ORIGINS` → 作为 `expectedOrigin` 传给 simplewebauthn；不带 → 默认 `WEBAUTHN_ORIGINS[0]`。移动端 clientDataJSON 里的 origin 必须命中：

- **iOS 原生**：origin = `https://<RP_ID>`（与 Web 相同）→ 现有 `WEBAUTHN_ORIGINS` 无需改；移动端显式带 `Origin: https://<RP_ID>` 即可
- **Android 原生**：origin = `android:apk-key-hash:<base64url(SHA-256 签名指纹)>`（非 URL）→ **必须**追加到 `WEBAUTHN_ORIGINS`（debug 包用 debug 指纹，release 用 release 指纹，各一条），移动端 finish 请求带同串 `Origin` header

```sh
# .env 示例（生产）
WEBAUTHN_ORIGINS=https://<RP_ID>,android:apk-key-hash:<debug指纹>,android:apk-key-hash:<release指纹>
```

> ⚠️ Android 指纹未配置时，Android 端登录会报 403「请求来源不受信任」（finish 段的 Origin 白名单先拦）。iOS 不受影响。

## 4. 依赖与平台配置

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  passkeys: ^2.22.1
```

| 平台 | 配置 | 说明 |
|------|------|------|
| iOS | `ios/Podfile`：`platform :ios, '16.0'` | passkey 需 iOS 16+ |
| iOS | Associated Domains entitlement：`webcredentials:<RP_ID>`（Xcode Signing & Capabilities） | 模拟器可跳过，**真机必须**（AASA 校验只对真机生效） |
| iOS | 模拟器需 Features → Face ID → Enrolled | 否则报 "Simulator requires enrolled biometrics" |
| Android | `minSdkVersion 28`（`android/app/build.gradle`） | Credential Manager 需 Android 9+ |
| Android | `MainActivity` → 继承 **`FlutterFragmentActivity`** | 否则 Credential Manager 直接崩（编译不报错） |
| Android | 模拟器需 Play Store 镜像（API 33/34）+ 登录 Google 账号 + 设置锁屏/指纹 | 缺任一 → `SyncAccountNotAvailableException` |

**iOS 优先**（Android SDK 未装，技术栈文档既定）：先 iOS 真机/模拟器跑通，Android 配置（指纹/包名/镜像）留 Android phase。

## 5. 认证流程

### 5.1 登录（凭证 ≥1）

```
登录页「使用通行密钥登录」
  → POST /api/auth/login/start                    （无 body）
  → PasskeyAuthenticator.authenticate(AuthenticateRequestType.fromJsonString(jsonEncode(start.options), mediation: optional, preferImmediatelyAvailableCredentials: false))
  → POST /api/auth/login/finish  body { challengeId, credential }   ← 带 Origin header
  → 200：捕获 Set-Cookie 的 serenique_session → 存 Keychain → auth state 更新 → 跳 /moments
```

- `start.options`（PublicKeyCredentialRequestOptionsJSON）含 `challenge/rpId/allowCredentials/userVerification`，插件 `fromJsonString` 直接吃，**零映射**
- `credential` 用插件返回的 `AuthenticateResponseType.toJson()`，与服务端 `AuthenticationCredentialSchema` **逐字段对齐**（`id/rawId/type/response{clientDataJSON,authenticatorData,signature,userHandle?}`）
- 失败分类：NotAllowedError →「已取消或没有可用的通行密钥」；429 →「尝试过于频繁，请稍后再试」（服务端节流透传）；401 →「登录验证失败」（服务端统一文案）
- counter 语义：服务端已按 W3C 修好（相等放行、回退拒绝，见 `fix-apple-passkey-counter.md`），移动端无感知

### 5.2 门禁探测（登录页加载时）

无参调 `POST /api/auth/register/start`：

| 结果 | 含义 | 登录页展示 |
|------|------|-----------|
| 403「引导注册令牌不正确」 | 凭证计数 0，引导期 | 「首次使用」卡片：说明 + 打开前端地址 `https://<RP_ID>/setup` 创建首个通行密钥的指引（**无 SETUP_TOKEN 输入**，决策④）+ 仍显示登录按钮（可点，但无凭证会取消） |
| 401「未认证」 | 已有凭证，需登录 | 仅「使用通行密钥登录」按钮 |
| 200（异常情况，不应发生） | 登录态探测 | 按 401 处理 |
| 500 / 网络错误 | 后端不可达等 | 「使用通行密钥登录」按钮 + 点击失败 toast |

### 5.3 添加设备（已登录，设置 → 登录凭证 → 添加）

```
→ POST /api/auth/register/start   body { }（会话 cookie 自动带上）
→ PasskeyAuthenticator.register(RegisterRequestType.fromJsonString(jsonEncode(start.options)))
→ POST /api/auth/register/finish  body { challengeId, deviceLabel?, credential }  ← 带 Origin header
→ 200「登录凭证添加成功」→ 刷新凭证列表
```

- `start.options`（PublicKeyCredentialCreationOptionsJSON）含 `challenge/rp/user/excludeCredentials/pubKeyCredParams/authenticatorSelection`，插件直接吃
- 响应 `RegisterResponseType.toJson()` 的 `transports` 在 `response.transports` 内 → **移动端 finish 时挪到顶层**（决策⑩）；`clientExtensionResults` 保留
- 添加成功即刷新会话 cookie（服务端 registerFinish 也发 Set-Cookie），无需重新登录
- `deviceLabel` 可选：添加后可到列表「重命名」（服务端有 `PUT /api/auth/credentials/:id`，handler 已实现）

### 5.4 登出

清 Keychain session + best-effort 调 `POST /api/auth/logout`（失败忽略，本地清除已生效）→ 跳 `/login`。

## 6. 会话管理（改造点）

服务端 cookie 属性：`serenique_session`，HttpOnly + Secure（生产）+ **Partitioned（CHIPS，生产跨站）**。原生客户端无浏览器 cookie 语义，`Partitioned` 属性直接忽略，只取 name=value。

| 现有代码 | 改造 |
|---------|------|
| `core/network/api_client.dart` `applyAuthHeader(options, tokenReader)` | 改为注入 `Cookie: serenique_session=<v>`（保留 `String? Function() sessionReader` 抽象；无 session 不动） |
| `features/auth/token_storage.dart` | 复用 `TokenStorage` 抽象（Keychain/Keystore），key 改 `serenique_session`；登录/注册 finish 时**先读响应头 Set-Cookie 再入库**（`ApiClient` 需暴露原始响应头，dio `Response.headers['set-cookie']`） |
| `features/auth/auth_providers.dart` | `AuthState { initializing, token }` → `{ initializing, session }`（字段改名）；`login(token)` → `loginWithPasskey()`（ceremony 编排）；`verifyTokenProvider` 删除 |
| `features/auth/login_page.dart` | 密钥输入框 → 门禁探测 + 通行密钥按钮 + 首次设置卡片 |
| `features/settings/settings_page.dart` | 打码密钥视图 → 三 tab（见 §7） |
| 路由 gate | **不动**：`initializing → /splash`、无 session → `/login`、有 → 放行（现有机制直接复用） |
| 401 自动登出 | 不动：`onUnauthorized` → 清 session → 跳登录 |

## 7. 设置页设计（镜像 Web `features/settings/`）

顶部 `DefaultTabController` 三 tab（AppBar TabBar）：

1. **个人信息**：`GET/PUT /api/users/me`（name/email/birthday；`""` → null 清除语义与服务端 `UpdateUserProfileSchema` 一致；birthday 用 `showDatePicker` + YYYY-MM-DD；提交后 invalidate 刷新）
2. **登录凭证**：`GET /api/auth/credentials` 列表（deviceLabel / 最后使用时间 / transports 图标）；行操作：重命名（dialog → `PUT /api/auth/credentials/:id`）、删除（确认 dialog → `DELETE`，**删最后一把 → 409** 透传「至少保留一把通行密钥」类中文提示）；底部「添加通行密钥」按钮 → §5.3 ceremony
3. **API 令牌**：`GET /api/tokens` 列表（prefix + name + 创建/最后使用时间）；创建（dialog 命名 → `POST /api/tokens` → **明文仅显示一次**弹窗，关闭即丢）；撤销（确认 dialog → `DELETE /api/tokens/:id`，已撤销重复撤销 404 透传）

新增 `features/auth/`：`webauthn.dart`（ceremony 编排 + 错误翻译，≈ Web `webauthn.ts`）、`auth_api.dart`（auth/tokens/users 接口）；`features/settings/` 扩展三 tab 组件。

## 8. 测试策略

- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿（技术栈既定）
- 单测：`webauthn.dart` 翻译函数（7 种错误映射）；`AuthController`（override 内存 session storage + 假 ceremony：restore / 登录成功存 session / 401 清 session / logout）；options→插件请求透传（`fromJsonString` 解析回读）
- widget 测试：登录页三态（引导期卡片 / 登录按钮 / 网络错误）；设置页三 tab 核心交互（凭证删除 409 文案、token 明文一次弹窗、个人信息空串清除）
- 真机验证（iOS 优先）：模拟器 Enroll Face ID 走通登录；真机过 AASA（需 entitlement + well-known 就位）；Android phase 另验

## 9. 实施计划

1. **前置**（非移动端）：Web 部署 AASA + assetlinks.json（iOS 先行）；服务端 `WEBAUTHN_ORIGINS` 追加 Android apk-key-hash 条目（Android phase 再做也行，iOS 不依赖）
2. **基础设施**：pubspec 加 `passkeys`；Podfile 16.0；`token_storage` → session 语义；`ApiClient` 注入 Cookie + 暴露响应头；`AuthController` 改造
3. **登录页**：门禁探测 + 通行密钥登录 + 首次设置卡片（`webauthn.dart` 翻译层）
4. **设置页**：三 tab（个人信息 / 凭证管理 / 令牌管理）
5. **验证**：analyze + test + iOS 模拟器全流程 smoke（登录取 cookie → me → 加设备 → 设置内各操作 → 登出）
6. **Android phase**（SDK 装好后）：minSdk 28 + FlutterFragmentActivity + 指纹入 assetlinks/WEBAUTHN_ORIGINS + 模拟器镜像验证

## 10. 已否决

- **cookie jar 依赖**（dio_cookie_manager）：多一个依赖，手动捕获 Set-Cookie 已够（单会话、HttpOnly 无需 JS 读）。
- **移动端提供 SETUP_TOKEN 首次注册**：需求 (b) 明确首个 passkey 走前端 `/setup` URL；移动端不重复造。
- **服务端改「移动端返 token」**：cookie 方案现成可用，服务端零改动（除 WEBAUTHN_ORIGINS 配置项）。
- **手写 options 字段映射**：插件 `fromJsonString` 与服务端 options JSON 直接兼容，映射层纯属浪费。
