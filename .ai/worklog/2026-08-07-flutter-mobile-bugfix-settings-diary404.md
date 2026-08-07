# 2026-08-07 — Flutter 移动端两处 bug 修复（设置页卡死 / 当日无日记新建坏）

修复 `apps/mobile` 两个已确认 bug：抽屉「设置」→ `/login` 回不去（Fix 1），当日无日记时「新增日记」编辑页无法进入（Fix 2）。TDD：先写失败测试，再修生产代码，最后 `flutter analyze && flutter test` 全绿。改动仅限 `apps/mobile`（含新增测试与页面）。

## Fix 1：设置入口回不去

- **根因**：`app_shell.dart` 抽屉「设置」`context.go('/login')`；`/login` 是 ShellRoute 外的顶层路由，`go()` 替换整栈，无抽屉、无返回按钮、右滑无效。`router.dart` redirect 又故意放行已认证用户停在 `/login`（为了显示登出入口），导致卡死。
- **修复**：新增独立设置页 `lib/features/settings/settings_page.dart`（显示「已登录」+ 打码密钥 + 「退出登录」，打码逻辑从 `LoginPage._mask` 迁入）。在 ShellRoute 内注册 `/settings`，抽屉改为 `context.go('/settings')`，redirect 改为「已认证：/splash 与 /login 都回 /moments」。`/login` 变纯表单页（删除 `_loggedIn/_logout/_mask` 与已登录三元分支）。
- **测试**：`test/router_test.dart` 原「已登录：/login 可达，显示已登录态」改为断言 `/login` 重定向到 `/moments` + 新增 `/settings` 显示「已登录」「退出登录」；`test/features/auth/login_page_test.dart` 删除迁走的已登录 UI 用例；新增 `test/features/settings/settings_page_test.dart`（含点「退出登录」→ 认证态清空）。

## Fix 2：当日无日记时编辑页进不去

- **根因**：`diary_providers.dart` 的 `diaryByDateProvider` 只匹配 `e.code == 'NOT_FOUND'`，但后端错误包目前无 `code` 字段（`{ success, message }`），dio 映射为 `ApiException('API_ERROR', '日记不存在', statusCode: 404)`，code 匹配失败 → rethrow → 无日记被当成错误，编辑页卡在错误/转圈。
- **修复**：`diaryByDateProvider` 双匹配 `e.code == 'NOT_FOUND' || e.statusCode == 404`（对齐 `auth_providers.dart` 登录 401 双匹配）。后端并行补 `code` 字段后仍防御性双匹配。
- **测试**：新增 `test/features/diary/diary_providers_test.dart`：404（无 code）→ 解析为 `null`；非 404（500）→ 仍上抛为 error。

## 验证结果

- `flutter analyze` → **No issues found**。
- `flutter test` → **40/40 PASS**（基线 36 + 新增 settings 2 + diary_providers 2 + router 净增 1 - login_page 删 1）。

## 对下一次会话的提示（pitfalls）

- **Riverpod 3（`flutter_riverpod: ^3.4.2`）错误态表示变了**：FutureProvider 抛错后状态落到 `AsyncLoading<...>(error: ...)`，`isAsyncError == false`、`hasError == true`。断言错误上抛要查 `state.hasError` / `state.error`，不要断言 `isA<AsyncError>()`。
- **Riverpod 3 `ProviderSubscription.close()` 是同步 `void`**，不要 `await sub.close()`（编译错）。`addTearDown(sub.close)` 传函数引用即可。
- **不要在纯 `test()` 里直接 `container.read(provider.future)` 等错误**：该 future 报错后 provider 状态机仍停在 loading，`container.dispose()` 会抛「provider was disposed during loading state」。要 `container.listen(provider, ...)` 保持订阅后再断言状态。
- **登出入口从 `/login` 迁到 `/settings`**：以后「设置 → 登出」走 `/settings`；`/login` 已认证不可达（redirect 回 `/moments`）。改动抽屉、路由、redirect 三处需同步，勿单独改一处。

## 参考

- 认证设计见 `.ai/requirements/2026-08-06-auth.md` 与 `.ai/worklog/2026-08-07-flutter-mobile-auth-dev.md`。
- 后端补 `code` 字段与 moment 排序见 `.ai/worklog/2026-08-07-api-error-envelope-code-moment-order.md`。
