# 2026-08-09 — Flutter 移动端 Passkey 认证改造：共享密钥 → Passkey (WebAuthn) 登录 + 设置页三 tab

按 `.ai/architecture/2026-08-09-flutter-passkey-auth-design.md`（已定稿）完成 `apps/mobile` 认证改造：登录页从「输入共享密钥」改为门禁探测 + 通行密钥登录 + 首次设置卡片；会话从本地 token 改为捕获服务端 Set-Cookie（`serenique_session`）；设置页从打码密钥视图改为三 tab（个人信息 / 登录凭证 / API 令牌）。服务端（v0.5.0 已部署）与 Web 端零改动，移动端只消费既有契约。

## 改动（未 commit，队长统一提交）

**依赖与平台**
- `pubspec.yaml`：+`passkeys: ^2.22.1`（corbado；`flutter pub get` 需代理 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897`）
- `ios/Runner.xcodeproj/project.pbxproj`：`IPHONEOS_DEPLOYMENT_TARGET` 14.0 → **16.0**（3 处 Runner target 配置）。⚠️ 项目是 **SPM 集成（无 Podfile）**，设计文档的「Podfile platform 16.0」以 pbxproj 部署目标等价落实
- `ios/Runner/Runner.entitlements`（新）：`com.apple.developer.associated-domains` = `webcredentials:serenique.0icey.icu`；pbxproj 三个 Runner config 加 `CODE_SIGN_ENTITLEMENTS`。真机必需；模拟器构建（no-codesign）验证通过
- Android 目录**未动**（SDK 未装，phase 后置）

**核心层**
- `lib/core/config.dart`：+`rpId`（`String.fromEnvironment('RP_ID', default 'serenique.0icey.icu')`）、`setupUrl` getter（`https://$rpId/setup`）
- `lib/core/network/api_client.dart`：`applyAuthHeader`(Bearer) → `applySessionCookie`（`Cookie: serenique_session=<v>`）；`tokenReader` 参数改名 `sessionReader`；+`sessionCookieFrom(Response)`（从 Set-Cookie 头取 cookie 值，忽略 HttpOnly/Secure/Partitioned 属性）；+`postRaw`/`deleteRaw`（原始响应，供 finish 段读 Set-Cookie 与 204 端点）；+`patchData`（重命名凭证是 **PATCH** 不是 PUT）；401 自动登出机制保留
- `lib/features/auth/token_storage.dart`：key `auth_token` → `serenique_session`（复用 TokenStorage 抽象）

**认证功能**
- `lib/features/auth/auth_token.dart` **删除**（token 编码修复逻辑退役）及 `test/features/auth/auth_token_test.dart`
- `lib/features/auth/auth_api.dart`（新）：AuthApi 类 + 模型（UserEntry / CredentialEntry / TokenEntry / TokenCreateResult / AuthMeEntry），覆盖 auth 双段 ceremony、me、credentials CRUD、users/me GET/PUT（`""`→null 清除语义对齐 UpdateUserProfileSchema）、tokens 创建/列表/撤销；204 无 body 特判（先判 statusCode 再 unwrap）；`registerStart` 无参调用（body `{}`）供门禁探测；+`authApiProvider`
- `lib/features/auth/webauthn.dart`（新）：`PasskeyCeremony` 抽象（生产 `PluginPasskeyCeremony` 包插件，测试注入假实现）；**transports 映射**：插件 `RegisterResponseType.toJson()` 把 transports 放 `response.transports` → finish 前挪到顶层（决策⑩）；登录 `AuthenticateRequestType.fromJsonString(options, mediation: Optional, preferImmediatelyAvailableCredentials: false)`；`translateWebauthnError`（插件异常按类型翻译：取消/无凭证→「已取消或没有可用的通行密钥」、环境不支持→NotSupported 文案、DomainNotAssociated→来源不受信任、ExcludeMatch→已注册过、Timeout→操作已中止；ApiException 服务端业务错误原样透传 message、网络层错误（statusCode==null）→「服务暂时不可用，请稍后再试」）；编排函数 `loginWithPasskeyCeremony` / `registerDeviceCeremony`；+`passkeyCeremonyProvider`
- `lib/features/auth/auth_providers.dart`：`AuthState{initializing, token}` → `{initializing, session}`（保留 `isAuthenticated`）；`verifyTokenProvider` 删除；`login(token)` → `loginWithPasskey()`（ceremony 编排，捕获 Set-Cookie 存 Keychain）；+`registerDevice({deviceLabel})`（注册成功刷新本地会话）；`logout()` = best-effort POST /api/auth/logout + 清本地；+`registerGateProvider`（无参 register/start：403→bootstrap、401→ready、其他→error）
- `lib/features/auth/login_page.dart`：密钥输入框 → 门禁探测三态（FutureProvider）：bootstrap → 首次使用卡片（说明 + 完整 `AppConfig.setupUrl` 可点击复制 + 登录按钮，**无 SETUP_TOKEN 输入**）；ready → 「使用通行密钥登录」按钮；error → 按钮 + 提示文案；成功 → `context.go('/moments')`；中文文案

**设置页（三 tab，镜像 Web features/settings）**
- `lib/features/settings/settings_page.dart`：`DefaultTabController` 三 tab + 底部固定「退出登录」
- `lib/features/settings/settings_providers.dart`（新）：`profileProvider` / `credentialsProvider` / `tokensProvider` + `formatDate` / `transportLabel` / `transportIcon`
- `lib/features/settings/profile_tab.dart`（新）：name/email/birthday 表单（GET/PUT /api/users/me；birthday 用 showDatePicker；空串提交清除；保存后 invalidate 回填）
- `lib/features/settings/credentials_tab.dart`（新）：凭证列表（deviceLabel/添加于/最近使用/transports 中文图标）+ 重命名 dialog（PATCH）+ 删除确认（**409「至少需要保留一把登录凭证」透传**）+ 添加通行密钥（registerDevice ceremony → invalidate）
- `lib/features/settings/tokens_tab.dart`（新）：令牌列表（name/`serenique_{prefix}…`/时间/已撤销 badge）+ 创建（命名 dialog → **明文仅显示一次弹窗**，复制按钮 + 关闭即丢）+ 撤销确认（204 处理；重复撤销 404 透传）

**路由**：`lib/router.dart` 机制不动（`initializing → /splash`、无 session → `/login`、有 → 放行），`AuthState.token` 字段适配已随 auth_providers 完成。

**测试**（172 tests 全绿）
- `test/helpers.dart`：+`FakePasskeyCeremony`（记录 options、可配置结果/异常）
- `test/features/auth/webauthn_test.dart`（新）：错误翻译 7 类 + ApiException 透传/网络错误特判 + transports 顶层映射 + options 透传（mediation/preferImmediatelyAvailableCredentials 断言）
- `test/features/auth/auth_controller_test.dart`（重写）：session 恢复 / loginWithPasskey 成功存 session / 服务端不下发会话 / 插件取消 / 网络错误 / 服务端 401 透传 / registerDevice 刷新会话 / logout / 门禁探测四分支
- `test/features/auth/login_page_test.dart`（重写）：三态 UI + 登录成功跳转 + 取消 toast + 401 透传
- `test/features/settings/settings_page_test.dart`（重写）：三 tab 渲染回填 / 个人信息空串清除（断言 PUT 参数）/ 凭证删除 409 文案 / 删除成功刷新 / token 明文一次弹窗关闭即消失 / 撤销已撤销标记 / 退出登录清本地
- `test/features/auth/auth_token_test.dart` 删除；`test/core/network/api_client_test.dart`（applySessionCookie / sessionCookieFrom / postRaw / tokenReader→sessionReader）；`test/router_test.dart`（登录流程改 passkey 按钮；/settings 断言改三 tab；settings 数据 override 避免真实 HTTP）；`test/widget_test.dart`（+registerGateProvider override）；moment/audit 测试仅改 `tokenReader` → `sessionReader`

## 验证

- `cd apps/mobile && flutter analyze`：**No issues found**
- `cd apps/mobile && flutter test`：**172 pass / 0 fail**
- `HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 flutter build ios --no-codesign --simulator`：**构建成功**（SPM 正确解析 passkeys/passkeys_darwin，部署目标 16.0 生效）
- 未做：真机 ceremony 端到端（需 AASA 就位 + 真机签名，见下）

## 坑 / 对下一次会话的提示

1. **本项目 iOS 用 SPM 不用 CocoaPods**（pbxproj 有 `FlutterGeneratedPluginSwiftPackage`，无 Podfile）。设计文档「Podfile platform 16.0」→ 实际改 pbxproj `IPHONEOS_DEPLOYMENT_TARGET`（3 处）。
2. **服务端重命名凭证是 `PATCH /api/auth/credentials/:id`**（不是 PUT）——`ApiClient` 补了 `patchData`。Web 端 api.ts 用 patch，AGENTS.md 路由表没写全，容易踩。
3. **corbado passkeys 插件异常是插件自己的类型**（`AuthenticatorException` 子类，如 `PasskeyAuthCancelledException`/`DomainNotAssociatedException`），不是浏览器 DOMException——翻译按类型适配（`package:passkeys/exceptions.dart`，已被 types.dart 重导出，无需单独 import）。
4. **插件注册响应的 transports 在 `response.transports` 内**，服务端 `RegistrationCredentialSchema` 期望顶层——finish 前必须挪（不挪 Zod 静默剥离，丢元数据不报错）。
5. **204 端点**（删凭证/撤令牌）dio 响应 body 为空，`unwrapResponse` 的 `response.json()` 会炸——`deleteRaw` 先判 `statusCode == 204`。
6. **widget 测试里真实 ApiClient = dio timeout timer pending**：设置页数据源 provider 不 override 时，真实 HTTP 请求（flutter_test 返回 400）会让 dio 的 10s connectTimeout timer 在测试结束时 pending → 「A Timer is still pending」失败。settings 相关测试一律 override `profileProvider`/`credentialsProvider`/`tokensProvider`（或 authApiProvider 假实现）。
7. **门禁探测语义**：无参 `POST /api/auth/register/start` → 403「引导注册令牌不正确」= 凭证计数 0 引导期（前提：生产 SETUP_TOKEN 已配置）；401 = 已有凭证需登录；无 SETUP_TOKEN 且计数 0 时是 500「服务端未配置引导注册令牌」→ 登录页走 error 态（可接受，生产不会出现）。
8. **会话 cookie 捕获**：dio `Response.headers['set-cookie']` 是 `List<String>`，`sessionCookieFrom` 按 `serenique_session=` 前缀取第一个匹配，原生客户端忽略 HttpOnly/Secure/Partitioned。
9. **真机 phase 待办**（本任务未做，因需真机/签名）：① bundle ID 仍是 `com.example.sereniqueMobile` 占位——AASA（`{"webcredentials":{"apps":["<TEAMID>.com.zeroicey.serenique"]}}`）需在确定正式 bundle ID + Team ID 后由 Web 端部署；② 首次真机构建时 Xcode 需重新解析带 associated-domains capability 的 provisioning profile（免费签名已验证 Team ID `ZWYHWSH3RJ`）；③ 模拟器需 Features → Face ID → Enrolled 才能走通 ceremony；④ Android phase：minSdk 28 + `FlutterFragmentActivity` + `Origin: android:apk-key-hash:<指纹>` 头 + `WEBAUTHN_ORIGINS` 追加（Android origin 非 URL，必须带 Origin header 与白名单，iOS 不需要）。
10. **`flutter pub get` / `flutter build ios` 等联网命令必须带代理**（本机 shell 无代理）：`HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897`。
