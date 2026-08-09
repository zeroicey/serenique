# 2026-08-09 — Flutter 移动端认证回退：App 内 Passkey → API token（免费签名可真机构建）

iOS 免费开发者账号（Personal Team `ZWYHWSH3RJ`）不支持 Associated Domains capability，App 内 passkey 无法真机构建（`flutter build ios --release` 报 "Personal development teams do not support the Associated Domains capability"）。用户决定移动端退回 **API token 认证**（同 CLI 模式）：登录页输入 Web 设置页「API 令牌」tab 创建的 token（`serenique_` + 32B base64url）→ 校验后存 Keychain → 后续请求 `Authorization: Bearer <token>`。服务端与 Web 端零改动（Passkey 全栈仍有效），只动 `apps/mobile`。

> **关键事实（分支差异，队长需知）**：工作区实际在 **`feat/ai-agent-module`** 分支（派单写的是 main，已 checkout，与事实不符）。移动端 passkey 改造 commit `f17c54a` **只在 main 上**；本分支移动端源码本来就是 token 版（merge-base `548ac8f` 恰在 passkey 移动端提交之前）。因此本次「回退」= 验证本树已是目标态 + 统一 token 文案 + 清理过期 iOS 生成物 + 真机 release 构建验证。`main` 上的 `.ai/worklog/2026-08-09-flutter-passkey-auth-mobile.md` 在本分支不存在，故新建本回退 worklog。

## 改动（未 commit，队长统一提交）

**文案统一（密钥 → 令牌，token 语义）**
- `lib/features/auth/auth_providers.dart`：格式错误文案 →「令牌格式不正确，请从 Web 端设置页重新复制」；401 →「令牌错误，请检查后重试」；注释同步
- `lib/features/auth/login_page.dart`：「输入你的 Serenique 令牌」+ 说明行「令牌在 Web 端设置页『API 令牌』创建」；hint `AUTH_TOKEN` → `serenique_…`；空输入 →「请输入令牌」
- `lib/features/settings/settings_page.dart`：+「令牌在 Web 端设置页创建/管理」提示（登录态卡片）；注释同步
- `lib/features/auth/auth_token.dart` / `token_storage.dart` / `test/helpers.dart`：注释 密钥 → 令牌（函数名 `repairTokenEncoding`/`isHeaderSafeToken` 不变）
- 测试同步：`auth_controller_test.dart`（401 断言文案）、`login_page_test.dart`（用例名+断言）、`settings_page_test.dart`（用例名 + 新增 Web 创建提示断言）

**确认已是回退目标态、无需改动（与派单对照）**
- `lib/core/config.dart`：无 `rpId`/`setupUrl`（派单项 1 ✅）
- `lib/core/network/api_client.dart`：已是 `applyAuthHeader` + `tokenReader` Bearer 注入；无 `sessionCookieFrom`/`postRaw`/Cookie 逻辑（派单项 2 ✅）
- `lib/features/auth/auth_token.dart`：已存在（派单项 3 ✅，08-08 编码修复逻辑本就保留）
- `lib/features/auth/token_storage.dart`：key 已是 `auth_token`（派单项 4 ✅）
- `lib/features/auth/auth_providers.dart`：已是 `AuthState{initializing, token}` + `login(String)`（含 repairTokenEncoding）；无 `registerDevice`/`registerGateProvider`；logout 仅清本地（派单项 5 ✅）
- `webauthn.dart`/`auth_api.dart`：本树不存在，无需删（派单项 6/7 ✅）
- `ios/Runner/Runner.entitlements`：不存在；`project.pbxproj` 无 `CODE_SIGN_ENTITLEMENTS`；部署目标 14.0（3 处）；`DEVELOPMENT_TEAM = ZWYHWSH3RJ` + `CODE_SIGN_STYLE = Automatic`（派单项 10 ✅）
- 测试：`webauthn_test.dart` 不存在；`auth_controller_test.dart`/`login_page_test.dart`/`settings_page_test.dart`/`router_test.dart`/`widget_test.dart`/`helpers.dart` 均已是 token 语义（派单项 11 ✅）

**过期生成物清理（gitignored，自动发生）**
- `ios/Flutter/ephemeral/Packages/` 与 `ios/Runner/GeneratedPluginRegistrant.{m,h}` 残留 main 上 passkey 构建产物（`passkeys_darwin`、`device_info_plus`、`package_info_plus`、`ua_client_hints`）。本次 `flutter build ios` 按 pubspec 重新生成：passkeys 零残留，仅剩 `image_picker` / `flutter_secure_storage` / `shared_preferences`

## 验证

- `cd apps/mobile && flutter analyze`：**No issues found**（门禁 1 ✅）
- `cd apps/mobile && flutter test`：**140 pass / 0 fail**（门禁 2 ✅）
- `cd apps/mobile && HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 flutter build ios --release --dart-define=API_BASE_URL=https://api.hcyj.xyz/serenique`：**✓ Built build/ios/iphoneos/Runner.app (20.1MB)**，日志 "Automatically signing iOS for device deployment using specified development team: ZWYHWSH3RJ"（门禁 3 ✅，回退核心目的达成——免费签名可真机构建，不再报 Associated Domains capability 错误）

## 坑 / 对下一次会话的提示

1. **免费签名 + Associated Domains 不可兼得**（Personal Team 硬限制）：App 内 passkey 要复活只能换付费开发者账号，或维持现状（Web 端 passkey + 移动端 API token，即当前方案）。设计文档 `2026-08-09-flutter-passkey-auth-design.md` 已加 ⚠️ 回退横幅（与 `2026-08-07-flutter-mobile-auth-design.md` 被取代时的处理一致），其「真机 phase 待办」项全部作废。
2. **token 身份权限边界（服务端事实）**：Bearer token 只能访问业务接口 + `/api/auth/me`；`/api/users/me`、`/api/auth/credentials`、`/api/tokens` 都要求 cookie 会话 → **移动端设置页不要做三 tab**，只做登录状态 + 打码 token + 退出 +「令牌在 Web 端设置页创建/管理」提示（已按此落实）。
3. **token 来源变了**：现在 token 是 Web 设置页「API 令牌」tab 创建的新 API token（`serenique_` + 32B base64url，明文仅创建时显示一次），不是旧 `AUTH_TOKEN`（已退役）。登录页 hint `serenique_…`、校验 `/api/auth/me` 200 才存、401（**无 code 字段**，按 `statusCode == 401`）→「令牌错误，请检查后重试」。
4. **微信复制 token 的 UTF-16 乱码修复必须保留**（`repairTokenEncoding`/`isHeaderSafeToken`，08-08 修的坑）——本次确认它一直在本树 auth_providers.login 里生效，别在后续改造里删掉。
5. **分支纪律**：本树 `feat/ai-agent-module` 与 main 的移动端代码分叉（main 有 passkey 版）。合并回 main 时 `apps/mobile` 与 `.ai/architecture/2026-08-09-flutter-passkey-auth-design.md` 会产生冲突，以「回退后 token 版」为准。
6. **构建命令带代理**：`flutter build ios` 联网（SPM 解析）需 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897`。
