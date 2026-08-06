# Flutter 移动端接入认证实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/mobile` 的认证占位换成真实认证：登录页录入共享密钥 → 校验（`/api/auth/me`）→ 存 Keychain → 全请求带 Bearer；无 token 强制登录；401 自动登出。

**Architecture:** 复用 v1 网络层（`ApiClient` 已预留 token 注入位）。新增 `TokenStorage` 抽象（Keychain）+ Riverpod `AuthController`（`Notifier<AuthState>`，启动恢复/登录/登出）+ go_router `redirect` gate。校验走 `verifyTokenProvider`（临时 client，不挂 401 回调）。

**Tech Stack:** Flutter 3.44.8；`flutter_secure_storage`、`flutter_riverpod` 3（手写 Notifier，不上 codegen）、`go_router`。

## Global Constraints

（来自 spec：`.ai/architecture/2026-08-07-flutter-mobile-auth-design.md`，违反即失败）

- 认证模型：移动端 **Bearer 直连**，不调 `/api/auth/login`、不走 Cookie。
- 密钥存 `flutter_secure_storage`（iOS Keychain / Android Keystore），**不进** shared_preferences。
- 登录**先校验后存**：提交 → 用输入的密钥调 `GET /api/auth/me` → 200 才写 Keychain；401 返回「密钥错误，请检查后重试」且不存。
- 登录/登出成功后必须 bump `routerRefresh`（`ValueNotifier<int>`）让 go_router `redirect` 重算。
- 401 自动登出只对正式请求生效：`ApiClient.onUnauthorized` → `AuthController.logout()`；校验用的临时 client 不挂回调。
- dev 无 `AUTH_TOKEN` 时后端跳过认证（`/me` 恒 200）→ 登录恒通过。
- 用户可见文案中文；错误提示由后端消息透传（`humanizeError`）。
- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿。
- 联网命令（`flutter pub add` 等）带代理 `http://127.0.0.1:7897`。

## 文件结构（本次计划完整清单）

```
apps/mobile/
├── pubspec.yaml                                # 改：+ flutter_secure_storage
├── lib/
│   ├── providers.dart                          # 改：删 authTokenProvider，+ routerRefreshProvider
│   ├── app.dart                                # 改：MaterialApp.router 用 appRouterProvider
│   ├── router.dart                             # 改：Provider<GoRouter> + redirect + /splash
│   ├── core/network/api_client.dart            # 改：+ onUnauthorized / Dio? dio；apiClientProvider 接 AuthController
│   └── features/auth/
│       ├── token_storage.dart                  # 建：TokenStorage + SecureTokenStorage
│       ├── auth_providers.dart                 # 建：AuthState/AuthController/verifyTokenProvider/providers
│       ├── splash_page.dart                    # 建：启动闪屏
│       └── login_page.dart                     # 改：占位 → 真实登录/登出
├── test/
│   ├── helpers.dart                            # 建：FakeTokenStorage（各测试共享）
│   ├── widget_test.dart                        # 改：冒烟测试适配认证 gate
│   ├── core/network/api_client_test.dart       # 改：+ onUnauthorized 测试
│   ├── features/auth/auth_controller_test.dart # 建
│   ├── features/auth/login_page_test.dart      # 建
│   └── router_test.dart                        # 建：redirect gate
```

---

## Task 1: 依赖 + TokenStorage + ApiClient.onUnauthorized

**Files:**
- Modify: `apps/mobile/pubspec.yaml`（`flutter pub add`）
- Create: `apps/mobile/lib/features/auth/token_storage.dart`
- Modify: `apps/mobile/lib/core/network/api_client.dart`
- Modify: `apps/mobile/test/core/network/api_client_test.dart`
- Create: `apps/mobile/test/helpers.dart`

**Interfaces:**
- Produces: `TokenStorage`（`read/write/delete`）、`SecureTokenStorage`、`FakeTokenStorage`（test/helpers.dart）、`ApiClient(onUnauthorized, dio?)`。Task 2 用这些。

- [ ] **Step 1: 添加依赖**

Run（带代理，目录 `apps/mobile`）:
```sh
cd apps/mobile
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter pub add flutter_secure_storage
```
Expected: `flutter_secure_storage: ^9.x` 写入 pubspec 并解析成功。

- [ ] **Step 2: 写 `lib/features/auth/token_storage.dart`**

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 密钥存取抽象：生产用 Keychain/Keystore，测试注入内存假实现。
abstract class TokenStorage {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> delete();
}

/// 生产实现：iOS Keychain / Android Keystore。
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'auth_token';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> delete() => _storage.delete(key: _key);
}
```

- [ ] **Step 3: 写 `test/helpers.dart`（测试共享假存储）**

```dart
import 'package:serenique_mobile/features/auth/token_storage.dart';

/// 测试用内存密钥存储。
class FakeTokenStorage implements TokenStorage {
  FakeTokenStorage([this.value]);

  String? value;
  int writes = 0;
  int deletes = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async {
    value = token;
    writes++;
  }

  @override
  Future<void> delete() async {
    value = null;
    deletes++;
  }
}
```

- [ ] **Step 4: 改 `lib/core/network/api_client.dart`**

给构造函数加 `onUnauthorized` 与 `Dio? dio`（后者供测试注入假 transport）；`_guard` 检测 401 时调用回调：

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../config.dart';
import 'api_exception.dart';
import 'unwrap.dart';

/// 给请求头注入 Bearer token；无 token 时不动。
void applyAuthHeader(RequestOptions options, String? Function() tokenReader) {
  final token = tokenReader();
  if (token != null && token.isNotEmpty) {
    options.headers['Authorization'] = 'Bearer $token';
  }
}

/// 全局单例 HTTP 客户端：统一 baseUrl、统一解包、token 注入位、异常映射。
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required String? Function() tokenReader,
    this.onUnauthorized,
    Dio? dio,
  }) : _tokenReader = tokenReader {
    _dio = dio ??
        Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        applyAuthHeader(options, _tokenReader);
        handler.next(options);
      },
    ));
  }

  final String baseUrl;
  final String? Function() _tokenReader;
  final Future<void> Function()? onUnauthorized;
  late final Dio _dio;

  Future<dynamic> getData(String path, {Map<String, dynamic>? query}) =>
      _guard(_dio.get(path, queryParameters: query));

  Future<dynamic> postData(String path, {Object? body}) =>
      _guard(_dio.post(path, data: body));

  Future<dynamic> putData(String path, {Object? body}) =>
      _guard(_dio.put(path, data: body));

  Future<dynamic> deleteData(String path) => _guard(_dio.delete(path));

  Future<dynamic> _guard(Future<Response<dynamic>> future) async {
    try {
      final res = await future;
      return unwrapResponse(res.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await onUnauthorized?.call();
      }
      throw ApiException.fromDioException(e);
    }
  }
}

// apiClientProvider 保持原样（仍读 authTokenProvider，Task 2 才改接线）；本任务不动它。
```

- [ ] **Step 5: 改 `test/core/network/api_client_test.dart` 加 onUnauthorized 测试**

在文件顶部加 imports 与假 adapter，文件尾加两个测试：

```dart
import 'dart:convert';
import 'dart:typed_data';
```

```dart
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  Future<ResponseBody> fetch(RequestOptions options,
          Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromString(body, statusCode,
          headers: {Headers.contentTypeHeader: ['application/json']});

  @override
  void close({bool force = false}) {}
}
```

```dart
group('onUnauthorized', () {
  test('401 触发回调', () async {
    final dio = Dio();
    dio.httpClientAdapter = _FakeAdapter(
        401, jsonEncode({'success': false, 'code': 'UNAUTHORIZED', 'message': '未认证或登录已过期'}));
    var called = false;
    final client = ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        onUnauthorized: () async => called = true,
        dio: dio);
    await expectLater(client.getData('/api/auth/me'), throwsA(isA<ApiException>()));
    expect(called, isTrue);
  });

  test('非 401 不触发回调', () async {
    final dio = Dio();
    dio.httpClientAdapter = _FakeAdapter(
        500, jsonEncode({'success': false, 'code': 'INTERNAL', 'message': '服务错误'}));
    var called = false;
    final client = ApiClient(
        baseUrl: 'http://x',
        tokenReader: () => null,
        onUnauthorized: () async => called = true,
        dio: dio);
    await expectLater(client.getData('/api/moments'), throwsA(isA<ApiException>()));
    expect(called, isFalse);
  });
});
```

- [ ] **Step 6: 门禁 + 提交**

Run: `flutter analyze` → No issues found。
Run: `flutter test` → Expected: 全部 PASS（Task 1 不改 apiClientProvider，authTokenProvider 仍在，全绿）。
```bash
git add apps/mobile/pubspec.yaml apps/mobile/pubspec.lock apps/mobile/lib/features/auth/token_storage.dart apps/mobile/lib/core/network/api_client.dart apps/mobile/test
git commit -m "feat(mobile): auth token storage + ApiClient onUnauthorized"
```

---

## Task 2: AuthController + 全局 provider + apiClientProvider 接线

**Files:**
- Create: `apps/mobile/lib/features/auth/auth_providers.dart`
- Modify: `apps/mobile/lib/providers.dart`（删 authTokenProvider，+ routerRefreshProvider）
- Modify: `apps/mobile/lib/core/network/api_client.dart`（恢复 apiClientProvider，接 AuthController）
- Test: `apps/mobile/test/features/auth/auth_controller_test.dart`

**Interfaces:**
- Produces: `AuthState{initializing, token, isAuthenticated}`、`AuthController.login(token)→Future<String?>` / `logout()`、`authControllerProvider`、`tokenStorageProvider`、`verifyTokenProvider`、`routerRefreshProvider`。Task 3/4 用这些。
- Consumes: `TokenStorage`（Task 1）、`ApiClient`/`AppConfig`。

- [ ] **Step 1: 写 `lib/providers.dart`（删旧 token 占位，+ routerRefresh）**

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// GoRouter 的 refreshListenable：认证状态变化时 bump，让 redirect 重算。
final routerRefreshProvider = Provider<ValueNotifier<int>>((ref) {
  final notifier = ValueNotifier<int>(0);
  ref.onDispose(notifier.dispose);
  return notifier;
});
```

- [ ] **Step 2: 写 `lib/features/auth/auth_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../providers.dart';
import 'token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => SecureTokenStorage());

/// 登录时用输入的密钥调 /api/auth/me 校验。抛 ApiException；UNAUTHORIZED = 密钥错。
final verifyTokenProvider = Provider<Future<void> Function(String token)>((ref) {
  return (token) async {
    final client = ApiClient(baseUrl: AppConfig.apiBaseUrl, tokenReader: () => token);
    await client.getData('/api/auth/me');
  };
});

class AuthState {
  const AuthState({required this.initializing, required this.token});

  final bool initializing;
  final String? token;

  bool get isAuthenticated => token != null;
}

class AuthController extends Notifier<AuthState> {
  TokenStorage get _storage => ref.read(tokenStorageProvider);

  @override
  AuthState build() {
    _restore();
    return const AuthState(initializing: true, token: null);
  }

  Future<void> _restore() async {
    final token = await _storage.read();
    state = AuthState(initializing: false, token: token);
    _bump();
  }

  /// 校验 + 存入。返回错误文案；null = 成功。
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

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
```

- [ ] **Step 3: 恢复 `lib/core/network/api_client.dart` 的 apiClientProvider**

文件尾追加（导入 `../../features/auth/auth_providers.dart`）：

```dart
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenReader: () => ref.read(authControllerProvider).token,
    onUnauthorized: () => ref.read(authControllerProvider.notifier).logout(),
  );
});
```

（`ApiClient` 定义在 api_client.dart，provider 也在同文件；它 import auth_providers.dart 与 api_providers 之间是 Dart 允许的环——已确认可用。）

- [ ] **Step 4: 写失败测试 `test/features/auth/auth_controller_test.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/token_storage.dart';
import '../../helpers.dart';

void main() {
  test('启动恢复已存 token', () async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
    ]);
    addTearDown(container.dispose);
    await pumpEventQueue();
    final state = container.read(authControllerProvider);
    expect(state.initializing, isFalse);
    expect(state.token, 'secret');
    expect(state.isAuthenticated, isTrue);
  });

  test('login 校验通过则存储并认证', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      verifyTokenProvider.overrideWithValue((token) async {}),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).login('  secret  ');
    expect(err, isNull);
    expect(storage.value, 'secret'); // trim 后
    expect(container.read(authControllerProvider).isAuthenticated, isTrue);
  });

  test('login 401 返回错误文案且不存储', () async {
    final storage = FakeTokenStorage();
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      verifyTokenProvider.overrideWithValue((token) async {
        throw const ApiException('UNAUTHORIZED', '未认证或登录已过期');
      }),
    ]);
    addTearDown(container.dispose);
    final err = await container.read(authControllerProvider.notifier).login('bad');
    expect(err, '密钥错误，请检查后重试');
    expect(storage.value, isNull);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });

  test('logout 清空 token', () async {
    final storage = FakeTokenStorage('secret');
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
    ]);
    addTearDown(container.dispose);
    await container.read(authControllerProvider.notifier).logout();
    expect(storage.deletes, 1);
    expect(container.read(authControllerProvider).isAuthenticated, isFalse);
  });
}
```

- [ ] **Step 5: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/auth test/core/network test/features/moment test/features/diary` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib apps/mobile/test
git commit -m "feat(mobile): auth controller (restore/login/logout) + wiring"
```

---

## Task 3: 路由 gate + 闪屏 + app 接线 + 冒烟测试适配

**Files:**
- Modify: `apps/mobile/lib/router.dart`
- Create: `apps/mobile/lib/features/auth/splash_page.dart`
- Modify: `apps/mobile/lib/app.dart`
- Modify: `apps/mobile/test/widget_test.dart`
- Test: `apps/mobile/test/router_test.dart`

**Interfaces:**
- Produces: `appRouterProvider`（Provider<GoRouter>）、`SplashPage`。Task 4 的登录页走 `/login` 路由。

- [ ] **Step 1: 写 `lib/features/auth/splash_page.dart`**

```dart
import 'package:flutter/material.dart';

/// 启动闪屏：读 Keychain 期间短暂展示。
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
```

- [ ] **Step 2: 改 `lib/router.dart`（redirect gate + Provider<GoRouter>）**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'app_shell.dart';
import 'features/auth/auth_providers.dart';
import 'features/auth/login_page.dart';
import 'features/auth/splash_page.dart';
import 'features/diary/diary_edit_page.dart';
import 'features/diary/diary_list_page.dart';
import 'features/moment/moment_create_page.dart';
import 'features/moment/moment_detail_page.dart';
import 'features/moment/moment_list_page.dart';
import 'providers.dart';

/// 声明式路由。未认证 → /login；启动读 Keychain → /splash；认证通过进 /moments。
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: ref.watch(routerRefreshProvider),
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      if (auth.initializing) return loc == '/splash' ? null : '/splash';
      if (!auth.isAuthenticated) return loc == '/login' ? null : '/login';
      if (loc == '/login' || loc == '/splash') return '/moments';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashPage()),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/moments', builder: (context, state) => const MomentListPage()),
          GoRoute(path: '/diary', builder: (context, state) => const DiaryListPage()),
        ],
      ),
      GoRoute(path: '/moments/create', builder: (context, state) => const MomentCreatePage()),
      GoRoute(
        path: '/moments/:id',
        builder: (context, state) => MomentDetailPage(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/diary/:date',
        builder: (context, state) => DiaryEditPage(date: state.pathParameters['date']!),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
    ],
  );
});
```

- [ ] **Step 3: 改 `lib/app.dart`（用 appRouterProvider）**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme.dart';
import 'router.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'Serenique',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
```

- [ ] **Step 4: 改 `test/widget_test.dart`（冒烟测试适配认证 gate）**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'helpers.dart';

void main() {
  testWidgets('App 冒烟测试：未登录落在登录页', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [tokenStorageProvider.overrideWithValue(FakeTokenStorage())],
      child: const App(),
    ));
    await tester.pumpAndSettle();
    expect(find.text('登录'), findsWidgets);
  });
}
```

- [ ] **Step 5: 写失败测试 `test/router_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'helpers.dart';

void main() {
  testWidgets('无 token：落在 /login', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);
  });

  testWidgets('有 token：落在 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(MomentListPage), findsOneWidget);
  });
}
```

- [ ] **Step 6: 门禁 + 提交**

Run: `flutter analyze` → No issues found。
Run: `flutter test` → 全部 PASS。
```bash
git add apps/mobile/lib apps/mobile/test
git commit -m "feat(mobile): auth gate via go_router redirect + splash"
```

---

## Task 4: 登录页真实表单（登录 + 登出）

**Files:**
- Modify: `apps/mobile/lib/features/auth/login_page.dart`
- Test: `apps/mobile/test/features/auth/login_page_test.dart`

**Interfaces:**
- Consumes: `authControllerProvider`、`verifyTokenProvider`（Task 2）、`humanizeError`（既有）。

- [ ] **Step 1: 写失败测试 `test/features/auth/login_page_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import '../../../helpers.dart';

void main() {
  testWidgets('错误密钥显示错误文案', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
        verifyTokenProvider.overrideWithValue((token) async {
          throw const ApiException('UNAUTHORIZED', '未认证或登录已过期');
        }),
      ],
      child: const MaterialApp(home: LoginPage()),
    ));
    await tester.enterText(find.byType(TextField), 'bad-token');
    await tester.tap(find.text('登录'));
    await tester.pumpAndSettle();
    expect(find.text('密钥错误，请检查后重试'), findsOneWidget);
  });

  testWidgets('已登录显示密钥打码与退出按钮', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(FakeTokenStorage('0123456789abcdef')),
      ],
      child: const MaterialApp(home: LoginPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('已登录'), findsOneWidget);
    expect(find.text('0123…cdef'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `flutter test test/features/auth/login_page_test.dart` → FAIL（占位页不满足断言）。

- [ ] **Step 3: 替换 `lib/features/auth/login_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_exception.dart';
import 'auth_providers.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final token = _controller.text.trim();
    if (token.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入密钥')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final error = await ref.read(authControllerProvider.notifier).login(token);
      if (error != null && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error)));
      }
      // 成功：redirect 已通过 routerRefresh 重算，自动进 /moments
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _logout() async {
    await ref.read(authControllerProvider.notifier).logout();
    // redirect 重算 → /login（已登录态变表单态）
  }

  String _mask(String token) {
    if (token.length <= 8) return '*' * token.length;
    return '${token.substring(0, 4)}…${token.substring(token.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('登录')),
      body: Center(
        child: auth.isAuthenticated ? _loggedIn(auth.token!) : _loginForm(),
      ),
    );
  }

  Widget _loginForm() {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('输入你的 Serenique 密钥',
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              obscureText: true,
              decoration: const InputDecoration(
                  hintText: 'AUTH_TOKEN', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('登录'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _loggedIn(String token) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_outline, size: 48),
          const SizedBox(height: 12),
          const Text('已登录'),
          const SizedBox(height: 4),
          Text(_mask(token), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: _logout, child: const Text('退出登录')),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/auth/login_page_test.dart` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/features/auth apps/mobile/test/features/auth
git commit -m "feat(mobile): real login page (verify token, logout)"
```

---

## Task 5: 收尾 — 全量门禁 + README + worklog

**Files:**
- Modify: `apps/mobile/README.md`
- Create: `.ai/worklog/2026-08-07-flutter-mobile-auth-dev.md`

- [ ] **Step 1: 全量门禁**

Run: `flutter analyze` → No issues found。
Run: `flutter test` → 全部 PASS。

- [ ] **Step 2: 更新 `apps/mobile/README.md`**

补一节「认证」：登录页录入 `AUTH_TOKEN`（后端根 `.env` 的共享密钥）→ 校验后存 iOS Keychain / Android Keystore → 全请求带 `Authorization: Bearer`。dev 后端未配 AUTH_TOKEN 时登录恒通过（后端跳过认证）。

- [ ] **Step 3: 写 `.ai/worklog/2026-08-07-flutter-mobile-auth-dev.md`**

记录：认证接入完成（TokenStorage/AuthController/gate/登录页）、校验先存、401 自动登出、对下次会话的提示（测试需 mock TokenStorage；真机验证需要后端强制认证——本地 API 需重启到 auth 代码并配 AUTH_TOKEN，或等公网部署）。

- [ ] **Step 4: 提交**

```bash
git add apps/mobile/README.md .ai/worklog/2026-08-07-flutter-mobile-auth-dev.md
git commit -m "feat(mobile): auth integration complete (login, gate, logout)"
```

---

## Self-Review 结果

- **Spec 覆盖**：TokenStorage（T1）、AuthController restore/login/logout（T2）、verifyTokenProvider 校验后存（T2）、router gate + splash（T3）、登录页（T4）、401 onUnauthorized（T1/T2）、README/worklog（T5）。全部决策点对应到任务。
- **无占位符**：所有步骤含完整可运行代码。
- **类型一致性**：`login` 返回 `Future<String?>`（错误文案/null）；`verifyTokenProvider` 是 `Provider<Future<void> Function(String)>`，测试 override 用同形；`routerRefreshProvider` 是 `Provider<ValueNotifier<int>>`；`appRouterProvider` 是 `Provider<GoRouter>`，app.dart 用 `ref.watch`。Task 1 不改 apiClientProvider（authTokenProvider 仍在），Task 2 删除 authTokenProvider 并把 apiClientProvider 接线到 AuthController。
- **已知注意点**：冒烟测试与 router 测试都要 override `tokenStorageProvider`（真实 secure storage 在 widget 测试里会 MissingPluginException）；api_client.dart ↔ auth_providers.dart 之间是 Dart 允许的循环 import（apiClientProvider 与 verifyTokenProvider 各自需要对方），已确认可用。
