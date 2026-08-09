# Flutter 移动端接入认证（Mobile Auth Integration）

> ⚠️ **已被取代**：后端认证已重构为 Passkey（v0.5.0），本文档的「共享密钥 Bearer 直连」方案已退役。当前有效设计见 `2026-08-09-flutter-passkey-auth-design.md`。

- 日期：2026-08-07
- 状态：**已定稿**（队长与用户确认，进入实现计划）
- 范围：`apps/mobile`（Flutter）。后端 auth 已完成并合入 main（`/api/auth/login|logout|me` + Bearer/Cookie 中间件）。
- 前置记录：`2026-08-06-auth.md`（requirements，认证模型）、`2026-08-06-flutter-mobile-tech-stack.md`（移动端技术栈）、`2026-08-07-flutter-mobile-v1-dev.md`（v1 worklog）

## 1. 背景与目标

后端认证已上线：所有 `/api/*` 路由（除 `/health`、`/`、`/api/auth/login|logout`、签名 blob 链接）要求 `Authorization: Bearer <AUTH_TOKEN>` 或 HttpOnly 会话 Cookie，401 统一 `{success:false, message:"未认证或登录已过期"}`（后端 401 响应**无 `code` 字段**，客户端按 `statusCode == 401` 匹配）。

移动端按 auth 设计采用 **Bearer 直连**（不走 Cookie，不调 `/api/auth/login`）：登录页录入共享密钥 → 存 Keychain → 后续每个请求带 Bearer。本任务把 v1 的认证占位（`authTokenProvider` 返回 null、登录占位页）替换为真实认证。

## 2. 已锁定决策

| 项 | 决策 |
|----|------|
| 存储 | **`flutter_secure_storage`**（iOS Keychain / Android Keystore），密钥不进 shared_preferences |
| 认证状态 | Riverpod 3 手写 `AuthController`（`Notifier<AuthState>`），启动从 Keychain 恢复 |
| 登录校验 | **先校验后存**：登录提交 → 用输入的密钥调 `GET /api/auth/me`（该接口需认证，正好验钥）→ 200 才写 Keychain；401 显示「密钥错误」 |
| 路由 gate | go_router `redirect` + `refreshListenable`：initializing → `/splash`；无 token → `/login`；有 token → 放行 |
| 401 自动登出 | `ApiClient` 加 `onUnauthorized` 回调 → 清 token → gate 跳登录页（校验用的临时 client 不挂回调） |
| 登出 | 仅清本地 Keychain（移动端 Bearer，无需调后端 `/logout`） |
| 文案 | 中文，错误提示由后端消息透传 |

**Why**：认证模型由后端 requirements 定死（共享密钥 + 移动端 Bearer）；校验先存是为了密钥打错当场反馈，避免「进了 App 又被弹回」；401 自动登出是换密钥后全端失效的兜底。

**How to apply**：登录/登出后必须 bump `routerRefresh` 让 redirect 重算；401 自动登出只对「正式请求」生效，登录校验用临时 client 隔离。

## 3. 依赖与文件

- 新增依赖：`flutter_secure_storage`。
- 新增 `lib/features/auth/auth_providers.dart`（`AuthState`/`AuthController`/`authControllerProvider`/`verifyTokenProvider`）。
- 新增 `lib/providers.dart` 的 `routerRefreshProvider`（`ValueNotifier<int>`，GoRouter `refreshListenable` 用）。
- 修改 `lib/core/network/api_client.dart`（加 `onUnauthorized`）。
- 修改 `lib/features/auth/login_page.dart`（占位 → 真实登录/登出）。
- 修改 `lib/router.dart`（加 redirect + `/splash` 路由；`appRouter` 改为 `Provider<GoRouter>`）。
- 修改 `lib/app.dart`（`MaterialApp.router` 接 `appRouterProvider`）。

## 4. 认证状态层（AuthController）

```dart
class AuthState {
  final bool initializing; // 启动时是否还在从 Keychain 读 token
  final String? token;
  bool get isAuthenticated => token != null;
}

class AuthController extends Notifier<AuthState> {
  TokenStorage get _storage => ref.read(tokenStorageProvider);

  @override
  AuthState build() { _restore(); return const AuthState(initializing: true, token: null); }

  Future<void> _restore() async {
    final token = await _storage.read();
    state = AuthState(initializing: false, token: token);
    _bump();
  }

  /// 校验 + 存入。返回错误文案（null = 成功）。
  Future<String?> login(String token) async {
    final trimmed = token.trim();
    try {
      await ref.read(verifyTokenProvider)(trimmed);
    } on ApiException catch (e) {
      if (e.code == 'UNAUTHORIZED') return '密钥错误，请检查后重试';
      rethrow;
    }
    await _storage.write(trimmed);
    state = AuthState(initializing: false, token: trimmed);
    _bump();
    return null;
  }

  Future<void> logout() async {
    await _storage.delete();
    state = const AuthState(initializing: false, token: null);
    _bump();
  }

  void _bump() => ref.read(routerRefreshProvider).value++;
}
```

- `TokenStorage` 抽象接口（`read/write/delete`），生产用 `SecureTokenStorage`（包装 `FlutterSecureStorage`），测试注入内存假实现。
- `verifyTokenProvider`（`Provider<Future<void> Function(String)>`）：用输入的密钥构造临时 `ApiClient`（`tokenReader: () => 输入密钥`，**不挂** `onUnauthorized`）调 `/api/auth/me`。
- dev 无 AUTH_TOKEN 时后端跳过认证，`/me` 恒 200 → 登录恒通过（本地零摩擦）。

## 5. 登录页（替换占位）

- 未登录：密钥输入框（`obscureText`）+ 登录按钮。提交 → `login(token)`：
  - 返回 null → 成功（redirect 自动进 `/moments`，不手动跳转）
  - 返回文案 → SnackBar 红字
  - 抛 ApiException → `humanizeError` 展示（网络失败等）
- 已登录：显示「已登录」+ 打码密钥（前 4 + … + 后 4）+ **退出登录**按钮（Drawer「设置」进来即此状态）。

## 6. 路由 gate

- `appRouterProvider = Provider<GoRouter>`，`refreshListenable: ref.watch(routerRefreshProvider)`。
- `redirect`：
  - `initializing` → `/splash`（闪屏转圈，token 读 Keychain 很快）
  - 未认证 → `/login`
  - 已认证在 `/splash` → `/moments`；已认证在 `/login` 放行（作「设置→登出」入口，显示已登录态）
- `initialLocation: '/splash'`。

## 7. 401 自动登出

- `ApiClient` 增加 `onUnauthorized`（`Future<void> Function()?`），`_guard` 捕获 DioException 且 `statusCode == 401` 时调用。
- `apiClientProvider` 把 `onUnauthorized` 接到 `AuthController.logout()`。
- 登录校验用临时 client（不挂回调），401 由登录页自己显示「密钥错误」。
- 并发 401 多次触发 logout → 幂等（delete），无害。

## 8. 测试策略

- `AuthController` 单测：override `tokenStorageProvider`（内存假）+ `verifyTokenProvider` → 测 restore / login 成功 / login 401 返回文案且不存 / logout。
- 登录页 widget 测试：错误密钥显示「密钥错误」；已登录态显示登出按钮。
- router redirect 测试：override auth 状态 → 无 token 首落在 `/login`，有 token 落在 `/moments`。
- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿。

## 9. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 凭证形态 | 共享密钥 Bearer 直连（后端 requirements 已定） |
| ② | 登录是否校验 | **校验后存**（调 `/api/auth/me`） |
| ③ | 存储 | `flutter_secure_storage`（Keychain/Keystore） |
| ④ | 启动 gate | go_router redirect + splash，密钥自动恢复 |
| ⑤ | 401 处理 | 自动清 token 跳登录 |
| ⑥ | 登出 | 仅清本地 Keychain，不调后端 |
| ⑦ | 测试 | TokenStorage 抽象注入，内存假 + verifier 假 |

## 10. 已否决

- 登录不校验直接存：密钥打错要等首次请求才暴露，UX 差。
- 调 `/api/auth/login` 换 Cookie：移动端设计明确走 Bearer，不走 Cookie。
- 登出调后端 `/logout`：Bearer 无服务端会话可清，多余网络请求。
- 用 shared_preferences 存密钥：明文不安全，违背 auth 设计「Keychain/Keystore」要求。
