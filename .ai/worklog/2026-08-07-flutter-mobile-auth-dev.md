# 2026-08-07 — Flutter 移动端认证接入完成（登录 / gate / 退出登录）

`apps/mobile` 认证接入收官（任务 1-5，分支 `feat/mobile-auth`）：登录页录入 `AUTH_TOKEN` → 校验后存 iOS Keychain / Android Keystore → 全局请求带 `Authorization: Bearer` → 401 自动登出。设计见 `.ai/requirements/2026-08-06-auth.md` 与 `.superpowers/sdd/2026-08-07-flutter-mobile-auth/` 计划，契约以 `services/api` 源码为准。

## 本次建成（任务 1-4 汇总）

- **TokenStorage**（`lib/features/auth/token_storage.dart`）：`TokenStorage` 抽象（read/write/delete）+ `SecureTokenStorage`（`flutter_secure_storage`，iOS Keychain / Android Keystore，key `auth_token`）。测试注入内存假实现。
- **ApiClient.onUnauthorized**（`lib/core/network/api_client.dart`）：dio 请求拦截器统一注入 Bearer；任何请求 `statusCode == 401` → 调 `onUnauthorized?.call()` → 自动登出（清存储 + 重定向 `/login`）。`apiClientProvider` 与 `auth_providers.dart` 循环 import（各自需要对方），Dart 允许，已确认可用。
- **AuthController**（`lib/features/auth/auth_providers.dart`）：`Notifier<AuthState>`（initializing/token/isAuthenticated）。`_restore()` 启动读安全存储；`login()` 校验后存（先 `verifyTokenProvider` 调 `GET /api/auth/me`，通过才写存储，失败返回错误文案/抛出）；`logout()` 清存储。登录态变化 `_bump()` → `routerRefreshProvider` → go_router redirect 重算。
- **路由 gate + 闪屏**（`lib/router.dart`、`lib/features/auth/splash_page.dart`）：`initialLocation: /splash`；redirect 未初始化 → `/splash`，未认证 → `/login`，已认证访问 `/login`/`/splash` → `/moments`。`App` 用 `ref.watch(appRouterProvider)` 接线。
- **真实登录页**（`lib/features/auth/login_page.dart`）：密码框录入 `AUTH_TOKEN`（空值拦截「请输入密钥」）；校验失败 `ApiException` → humanize 中文提示；`_submitting` 禁用按钮；已登录态显示打码密钥 + 退出登录。

## 验证结果（任务 5）

- `flutter analyze` → **No issues found**。
- `flutter test` → **34/34 PASS**（含 auth_controller / login_page / router gate / 冒烟，以及既有 moment / diary / api_client / unwrap）。

## 对下一次会话的提示（pitfalls）

- **测试必须 override `tokenStorageProvider`**：真实 `flutter_secure_storage` 在 widget 测试里会 `MissingPluginException`。冒烟 / router / login_page / auth_controller 测试都注入内存假 `TokenStorage`。
- **真机验证需要后端强制认证**（本次未做，属后续人工联调）：dev 本地 API 未配 `AUTH_TOKEN` 时认证整体跳过 → 登录恒通过、`/api/auth/me` 恒 200，看不出真实 401 行为。联调需：本地 API 重启到 auth 代码 + 根 `.env` 配 `AUTH_TOKEN`（≥32 字符，生产缺失 fail-closed），或等公网 API 重新部署到 auth 代码后真机跑通登录/登出/401 登出。
- **后端 401 body 没有 `code` 字段**：`Res.unauthorized(...)` 只产出 `{success, message}`，`ApiException.fromDioException` 里 `data['code']` 缺失回退 `API_ERROR`。因此 `AuthController.login` 判定密钥错误用 `e.code == 'UNAUTHORIZED' || e.statusCode == 401` 双匹配（commit `5c76ccb`）。
- **换密钥 = 全端失效**：改根 `.env` 的 `AUTH_TOKEN` 后旧 Bearer 全部失效，需重新登录（后端无会话表，属设计预期）。
- **存储异常不应掩盖 401**：`onUnauthorized` 里 logout 回调包了 try/catch，存储删除抛错时保留原始 `ApiException` 继续上抛。

## 顺延项（评审 ledger 的 minor，低成本可后续补）

- `_restore()` 是 fire-and-forget，`storage.read` 抛错会变未处理异步错误（可加 try/catch 守卫）。
- `_logout` 无 mounted/错误处理（logout 快、影响低）。
- 登录页 TextField 无 `onSubmitted`（Enter 提交）、空输入只 SnackBar 无字段级校验。
- `routerRefreshProvider` bump 无测试断言；`onUnauthorized` logout-wrap 无单测。
- 认证是否在真机 Keychain 正确持久化列为终验收项。

## 参考

- API 侧认证实施与部署步骤见 `.ai/worklog/2026-08-06-auth-implementation.md`（`AUTH_TOKEN` 配法、fail-closed、CORS、dev 跳过）。
- 移动端 v1 基线见 `.ai/worklog/2026-08-07-flutter-mobile-v1-dev.md`。
