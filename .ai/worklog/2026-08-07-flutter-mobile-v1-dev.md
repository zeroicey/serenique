# 2026-08-07 — Flutter 移动端 v1 开发完成（moment + diary + drawer 导航）

`apps/mobile` v1 全量门禁通过 + iOS 真机构建验证完成，任务 1-9 收官。v1 范围 = 登录占位 + 闪记（Moment）+ 日记（Diary），消费同一套 Serenique REST API。

## 本次建成模块（任务 1-8 汇总）

- **骨架**：Material3 主题 + 暗黑模式、`AppConfig`（`--dart-define=API_BASE_URL`，默认 `http://localhost:3000`）、依赖 dio + Riverpod 3 + go_router + shared_preferences。
- **网络层**（`lib/core/network/`）：`ApiException`（错误分类）、`unwrap`（统一响应 `{success,message,data?,error?}` 解包 + 中文 humanizeError）、`ApiClient`（dio、Bearer token 注入）。
- **壳 + 路由 + Drawer**：`AppShell` 提供 AppBar + Drawer（闪记/日记/登录占位），`go_router` 管理路由。
- **闪记**：列表 / 新建 / 详情 / 评论（text ≤500、comment ≤2000），FutureProvider + invalidate 刷新。
- **日记**：列表 / 按日期新建 / 编辑 / 删除（content + diaryDate）。

## 验证结果（本次任务 9）

- `flutter analyze` → **No issues found**。
- `flutter test` → **24/24 PASS**（app_shell / api_client / unwrap / moment 列表·详情·models / diary 列表·models / widget 冒烟）。
- `flutter devices` → **hpcell 已连接**（iPhone 15 Pro，iOS 26.5.2，UDID `00008130-000144D21451001C`）。
- `flutter build ios --debug`（带代理）→ **成功**：`Xcode build done. 33.5s` → `✓ Built build/ios/iphoneos/Runner.app`（exit 0）。
- **ATS 已生效**：built `Runner.app/Info.plist` 含 `NSAppTransportSecurity` → `NSAllowsArbitraryLoads = true`。
- **插件集成确认**：built 包里含 `shared_preferences_foundation_shared_preferences_foundation.bundle`，`Runner.debug.dylib` 含 `SharedPreferencesPlugin` 符号。**注意：本项目 iOS 走 Swift Package Manager（`.flutter-plugins-dependencies` 里 `swift_package_manager_enabled.ios=true`），没有 CocoaPods/Podfile，全程没跑 pod install。** 预计会被命令的人机交互 `flutter run -d hpcell` 留给人类执行。

## 对下一次会话的提示（pitfalls）

- **shell 没有 http_proxy**：任何 Flutter 联网命令（`pub get`、`pod install`、构建、版本检查）都要加 `HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7897`。虽然本项目 iOS 用 SPM 不跑 pod install，但 pub 解析等仍需代理。
- **iOS ATS 明文 HTTP 例外**：为开发期连 Mac 局域网 API 在 `Info.plist` 加了 `NSAllowsArbitraryLoads=true`。**发布前必须收紧**（改 `NSAllowsLocalNetworking` 或按域名白名单）。
- **免费签名 7 天过期**：`DEVELOPMENT_TEAM=ZWYHWSH3RJ`（个人免费团队），过期重跑 `flutter run` 前报签名失效就重新安装一次。
- **`/moments/create` 字面路由必须在 `/moments/:id` 之前注册**（go_router 精确匹配优先），已按此顺序在 `lib/router.dart` 声明并加注释。
- **壳内页面不能再自建 AppBar**：`/moments`、`/diary` 在 `ShellRoute` 内，AppBar + Drawer 由 `AppShell` 提供；只有全屏页（详情/编辑/登录）自己带 AppBar。
- **契约以 `services/api` 源码为准**：moment 用 `text`（不是 content）、event 用 `title/startAt/endAt/isAllDay/location/note`、diary 用 `content/diaryDate`；列表解包 `items`（事件列表除外，是裸数组）。
- **首次真机安装**：手机「设置 → 通用 → VPN 与设备管理」信任开发者证书，否则报「未受信任的开发者」。
- **Android 未装 SDK**：`flutter doctor` Android 项红不影响 iOS；要跑 Android 再装。
