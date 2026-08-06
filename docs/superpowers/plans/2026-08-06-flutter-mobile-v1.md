# Flutter 移动端 v1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/mobile` 把 Serenique 移动端 v1 建起来：工程骨架 + 网络层 + Drawer 侧栏壳 + 登录占位 + Moment（文本+评论）+ Diary（列表+编辑）。

**Architecture:** feature-first 平铺结构（镜像 `apps/web`）。每模块 = models（手写模型）+ api（dio 封装）+ providers（Riverpod FutureProvider ≈ TanStack Query）+ pages。写操作集中在一个 Actions 类，成功后 `ref.invalidate` 刷新。Drawer 侧栏由 `ShellRoute` 包住模块页；详情/编辑页全屏 push。

**Tech Stack:** Flutter 3.44.8 / Dart ^3.12.2；dio、flutter_riverpod 3、go_router ^17、shared_preferences、intl；`flutter test` + `flutter analyze`。

## Global Constraints

（来自 spec：`.ai/architecture/2026-08-06-flutter-mobile-tech-stack.md`，违反即失败）

- 视觉原生 Material 3；**不引**第三方组件库 / 图标库 / 表单库；图标用内置 `Icons`。
- 状态管理 Riverpod 3，**手写 provider**，不上 `riverpod_generator`/build_runner。
- HTTP 用 dio + 轻封装：统一解包 `{success, message, data?, error?}` + token 拦截器位。
- 路由 go_router；导航 = Drawer 滑出侧栏（底部 tab 不做）。
- 存储 shared_preferences；`flutter_secure_storage` 待 auth 落地再上。
- 纯在线，不引本地数据库。
- 用户可见文案**中文**；后端消息中文直接透传展示。
- 模型类**手写**、对齐 `services/api` 源码字段名，不做运行时动态类型。
- 契约：moment `text`≤500；评论 `content`≤2000；diary `content` + `diaryDate`(YYYY-MM-DD)；列表 `data.items + data.total`；评论列表裸数组。
- 门禁：`flutter analyze` 无告警 + `flutter test` 全绿。
- Flutter 联网命令必须带代理 `http://127.0.0.1:7897`（shell 默认无 http_proxy）。

## 文件结构（本次计划创建的完整清单）

```
apps/mobile/
├── pubspec.yaml                         # 改：加依赖
├── lib/
│   ├── main.dart                        # 改：ProviderScope + runApp
│   ├── app.dart                         # 改：MaterialApp.router + 主题
│   ├── router.dart                      # 建：go_router 声明式路由
│   ├── app_shell.dart                   # 建：AppBar + NavigationDrawer 壳
│   ├── providers.dart                   # 建：authTokenProvider（占位）
│   ├── core/
│   │   ├── config.dart                  # 建：API_BASE_URL（--dart-define）
│   │   ├── theme.dart                   # 建：Material 3 亮/暗主题
│   │   └── network/
│   │       ├── api_exception.dart       # 建：ApiException + humanizeError
│   │       ├── unwrap.dart              # 建：unwrapResponse / unwrapItems
│   │       └── api_client.dart          # 建：ApiClient + applyAuthHeader + apiClientProvider
│   ├── shared/widgets/async_view.dart   # 建：AsyncErrorView（错误+重试）
│   └── features/
│       ├── auth/login_page.dart         # 建：登录占位页
│       ├── moment/
│       │   ├── moment_models.dart       # 建：Moment / MomentComment
│       │   ├── moment_api.dart          # 建：列表/详情/创建/删除/评论
│       │   ├── moment_providers.dart    # 建：providers + MomentActions
│       │   ├── moment_list_page.dart    # 建（先 stub 后实现）
│       │   ├── moment_detail_page.dart  # 建（先 stub 后实现）
│       │   ├── moment_create_page.dart  # 建（先 stub 后实现）
│       │   └── widgets/comment_section.dart # 建：评论列表+新增
│       └── diary/
│           ├── diary_models.dart        # 建：DiaryEntry
│           ├── diary_api.dart           # 建：列表/按日期/创建/更新/删除
│           ├── diary_providers.dart     # 建：providers + DiaryActions
│           ├── diary_list_page.dart     # 建（先 stub 后实现）
│           └── diary_edit_page.dart     # 建（先 stub 后实现）
├── test/
│   ├── widget_test.dart                 # 改：App 冒烟测试
│   ├── core/network/unwrap_test.dart    # 建
│   ├── core/network/api_client_test.dart# 建
│   ├── features/moment/moment_models_test.dart      # 建
│   ├── features/moment/moment_list_page_test.dart   # 建
│   ├── features/moment/moment_detail_page_test.dart # 建
│   ├── features/diary/diary_models_test.dart        # 建
│   └── features/diary/diary_list_page_test.dart     # 建
├── ios/Runner/Info.plist                # 改：ATS 例外（开发期）
└── README.md                            # 改：运行说明
```

---

## Task 1: 工程骨架（依赖 + config + theme + app + main）

**Files:**
- Modify: `apps/mobile/pubspec.yaml`（`flutter pub add` 自动改）
- Create: `apps/mobile/lib/core/config.dart`, `apps/mobile/lib/core/theme.dart`, `apps/mobile/lib/app.dart`
- Replace: `apps/mobile/lib/main.dart`, `apps/mobile/test/widget_test.dart`

**Interfaces:**
- Produces: `AppConfig.apiBaseUrl`（const String）、`AppTheme.light()`/`AppTheme.dark()`（ThemeData）、`App`（ConsumerWidget）。Task 3 用这些。

- [ ] **Step 1: 添加依赖**

Run（带代理，目录 `apps/mobile`）:
```sh
cd apps/mobile
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter pub add dio flutter_riverpod go_router shared_preferences intl
```
Expected: 5 个包已写入 `pubspec.yaml` 的 `dependencies` 并解析成功。首次在 iOS 构建会触发 `pod install`（shared_preferences 是原生插件），若卡在网络，同样给 pod 命令加代理。

- [ ] **Step 2: 写 `lib/core/config.dart`**

```dart
/// 全局配置。API 地址通过 --dart-define=API_BASE_URL 注入。
class AppConfig {
  AppConfig._();

  /// 真机调试时传 --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
```

- [ ] **Step 3: 写 `lib/core/theme.dart`**

```dart
import 'package:flutter/material.dart';

/// Material 3 主题：品牌色种子 + 亮/暗两套，跟系统。
class AppTheme {
  AppTheme._();

  static const Color seed = Color(0xFF6750A4);

  static ThemeData light() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
      );

  static ThemeData dark() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
      );
}
```

- [ ] **Step 4: 写 `lib/app.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'Serenique',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: const Scaffold(body: Center(child: Text('Serenique'))),
    );
  }
}
```

- [ ] **Step 5: 替换 `lib/main.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';

void main() {
  runApp(const ProviderScope(child: App()));
}
```

- [ ] **Step 6: 替换 `test/widget_test.dart`（App 冒烟测试）**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:serenique_mobile/app.dart';

void main() {
  testWidgets('App 冒烟测试：可构建', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    expect(find.text('Serenique'), findsOneWidget);
  });
}
```

- [ ] **Step 7: 门禁 + 提交**

Run: `flutter analyze` → Expected: No issues found。
Run: `flutter test` → Expected: 1 test PASS。

```bash
git add apps/mobile
git commit -m "feat(mobile): scaffold app skeleton (deps, theme, config)"
```

---

## Task 2: core/network（ApiException + unwrap + ApiClient）

**Files:**
- Create: `apps/mobile/lib/providers.dart`, `apps/mobile/lib/core/network/api_exception.dart`, `apps/mobile/lib/core/network/unwrap.dart`, `apps/mobile/lib/core/network/api_client.dart`
- Test: `apps/mobile/test/core/network/unwrap_test.dart`, `apps/mobile/test/core/network/api_client_test.dart`

**Interfaces:**
- Produces: `ApiException(code, message, statusCode?)`；`humanizeError(Object)`；`unwrapResponse(Object?) → dynamic`；`unwrapItems(dynamic) → List<dynamic>`；`applyAuthHeader(RequestOptions, String? Function())`；`ApiClient(baseUrl, tokenReader)` with `getData/postData/putData/deleteData`；`apiClientProvider`（Provider<ApiClient>）；`authTokenProvider`（Provider<String?>）。
- Consumes: `AppConfig.apiBaseUrl`（Task 1）。Task 4/7 的 `xxx_api.dart` 用 `ApiClient`。

- [ ] **Step 1: 写 `lib/providers.dart`（全局 provider）**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 全局占位：登录密钥。auth 后端落地后改为从 flutter_secure_storage 读取。
final authTokenProvider = Provider<String?>((ref) => null);
```

- [ ] **Step 2: 写 `lib/core/network/api_exception.dart`**

```dart
import 'package:dio/dio.dart';

/// 统一 API 异常。code 对应后端错误码，message 已是中文，可直接展示。
class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  /// 把 dio 网络层异常映射成业务异常。
  factory ApiException.fromDioException(DioException e) {
    final type = e.type;
    if (type == DioExceptionType.connectionTimeout ||
        type == DioExceptionType.sendTimeout ||
        type == DioExceptionType.receiveTimeout) {
      return const ApiException('TIMEOUT', '请求超时，请检查网络');
    }
    if (type == DioExceptionType.connectionError) {
      return const ApiException('NETWORK', '网络连接失败，请检查网络');
    }
    // 后端业务错误：badResponse，响应体已是统一结构
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final code = data['code'] as String? ?? 'API_ERROR';
      final message = data['message'] as String? ?? '请求失败';
      return ApiException(code, message, statusCode: e.response?.statusCode);
    }
    return const ApiException('UNKNOWN', '未知错误，请稍后重试');
  }

  @override
  String toString() => 'ApiException($code, $message)';
}

/// 面向用户的错误文案：业务错误透传后端中文消息，其余给兜底。
String humanizeError(Object e) =>
    e is ApiException ? e.message : '操作失败，请稍后重试';
```

- [ ] **Step 3: 写 `lib/core/network/unwrap.dart`**

```dart
import 'api_exception.dart';

/// 统一响应解包。成功时返回 data，失败抛 ApiException。
dynamic unwrapResponse(Object? body) {
  if (body is! Map<String, dynamic>) {
    throw const ApiException('BAD_RESPONSE', '响应格式错误');
  }
  final success = body['success'];
  if (success != true) {
    final code = body['code'] as String? ?? 'API_ERROR';
    final message = body['message'] as String? ?? '请求失败';
    throw ApiException(code, message);
  }
  return body['data'];
}

/// 把分页对象 {items,total} 或裸数组解成条目列表。
List<dynamic> unwrapItems(dynamic data) {
  if (data is Map<String, dynamic>) {
    return data['items'] as List<dynamic>? ?? [];
  }
  if (data is List<dynamic>) return data;
  return [];
}
```

- [ ] **Step 4: 写 `lib/core/network/api_client.dart`**

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers.dart';
import '../config.dart';
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
  ApiClient({required this.baseUrl, required String? Function() tokenReader})
      : _tokenReader = tokenReader;

  final String baseUrl;
  final String? Function() _tokenReader;

  late final Dio _dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  )..interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        applyAuthHeader(options, _tokenReader);
        handler.next(options);
      },
    ));

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
      throw ApiException.fromDioException(e);
    }
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenReader: () => ref.read(authTokenProvider),
  );
});
```

- [ ] **Step 5: 写失败测试 `test/core/network/unwrap_test.dart`**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/core/network/unwrap.dart';

void main() {
  group('unwrapResponse', () {
    test('成功：返回 data', () {
      final data = unwrapResponse(
          {'success': true, 'message': '查询成功', 'data': {'id': '1'}});
      expect(data, {'id': '1'});
    });

    test('成功但无 data：返回 null', () {
      expect(unwrapResponse({'success': true, 'message': 'ok'}), isNull);
    });

    test('业务失败：抛 ApiException 带 code/message', () {
      expect(
        () => unwrapResponse(
            {'success': false, 'code': 'NOT_FOUND', 'message': '未找到'}),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'NOT_FOUND')
            .having((e) => e.message, 'message', '未找到')),
      );
    });

    test('响应不是对象：抛 BAD_RESPONSE', () {
      expect(() => unwrapResponse('oops'), throwsA(isA<ApiException>()));
    });
  });

  group('unwrapItems', () {
    test('分页对象 {items,total}', () {
      expect(unwrapItems({'items': [1, 2], 'total': 2}), [1, 2]);
    });

    test('裸数组', () {
      expect(unwrapItems([1, 2, 3]), [1, 2, 3]);
    });

    test('异常值 → 空列表', () {
      expect(unwrapItems(null), isEmpty);
      expect(unwrapItems('x'), isEmpty);
    });
  });
}
```

- [ ] **Step 6: 写失败测试 `test/core/network/api_client_test.dart`**

```dart
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';

void main() {
  group('applyAuthHeader', () {
    test('有 token：注入 Bearer', () {
      final options = RequestOptions(path: '/api/moments');
      applyAuthHeader(options, () => 'secret');
      expect(options.headers['Authorization'], 'Bearer secret');
    });

    test('无 token：不加头', () {
      final options = RequestOptions(path: '/api/moments');
      applyAuthHeader(options, () => null);
      expect(options.headers.containsKey('Authorization'), isFalse);
    });
  });

  group('ApiException.fromDioException', () {
    DioException dio(Type type, {Response? response}) =>
        DioException(requestOptions: RequestOptions(path: '/'), type: type, response: response);

    test('超时 → TIMEOUT', () {
      expect(ApiException.fromDioException(dio(DioExceptionType.connectionTimeout)).code, 'TIMEOUT');
    });

    test('连接失败 → NETWORK', () {
      expect(ApiException.fromDioException(dio(DioExceptionType.connectionError)).code, 'NETWORK');
    });

    test('badResponse：透传后端 code/message', () {
      final e = dio(DioExceptionType.badResponse, response: Response(
        requestOptions: RequestOptions(path: '/'),
        statusCode: 404,
        data: {'success': false, 'code': 'NOT_FOUND', 'message': '日记不存在'},
      ));
      final ae = ApiException.fromDioException(e);
      expect(ae.code, 'NOT_FOUND');
      expect(ae.message, '日记不存在');
      expect(ae.statusCode, 404);
    });
  });

  group('humanizeError', () {
    test('ApiException 透传 message', () {
      expect(humanizeError(const ApiException('X', '出错了')), '出错了');
    });

    test('其他异常 → 兜底文案', () {
      expect(humanizeError(StateError('boom')), '操作失败，请稍后重试');
    });
  });
}
```

- [ ] **Step 7: 运行测试**

Run: `flutter test test/core/network` → Expected: 全 PASS。

- [ ] **Step 8: 门禁 + 提交**

Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/providers.dart apps/mobile/lib/core/network apps/mobile/test/core
git commit -m "feat(mobile): network layer (ApiException, unwrap, ApiClient)"
```

---

## Task 3: 壳 + 路由 + Drawer + 登录占位页

**Files:**
- Create: `apps/mobile/lib/app_shell.dart`, `apps/mobile/lib/router.dart`
- Create (stub，后续任务替换实现): `apps/mobile/lib/features/auth/login_page.dart`, `apps/mobile/lib/features/moment/moment_list_page.dart`, `apps/mobile/lib/features/moment/moment_detail_page.dart`, `apps/mobile/lib/features/moment/moment_create_page.dart`, `apps/mobile/lib/features/diary/diary_list_page.dart`, `apps/mobile/lib/features/diary/diary_edit_page.dart`
- Modify: `apps/mobile/lib/app.dart`（改用 `MaterialApp.router`）
- Test: `apps/mobile/test/app_shell_test.dart`

**Interfaces:**
- Produces: `appRouter`（GoRouter）、`AppShell(child)`、`MomentListPage`/`MomentDetailPage(id)`/`MomentCreatePage`/`DiaryListPage`/`DiaryEditPage(date)`/`LoginPage`（本任务为 stub）。Task 4-8 只替换各 page 文件体。
- Consumes: `AppTheme`（Task 1）。

- [ ] **Step 1: 写 5 个 stub 页 + 登录占位页**

每个 stub 页都是最小可编译占位，任务里随后替换：

`lib/features/moment/moment_list_page.dart`:
```dart
import 'package:flutter/material.dart';

class MomentListPage extends StatelessWidget {
  const MomentListPage({super.key});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('闪记列表（开发中）')));
}
```

`lib/features/moment/moment_detail_page.dart`:
```dart
import 'package:flutter/material.dart';

class MomentDetailPage extends StatelessWidget {
  const MomentDetailPage({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: Text(id)), body: const Center(child: Text('闪记详情（开发中）')));
}
```

`lib/features/moment/moment_create_page.dart`:
```dart
import 'package:flutter/material.dart';

class MomentCreatePage extends StatelessWidget {
  const MomentCreatePage({super.key});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('新建闪记（开发中）')));
}
```

`lib/features/diary/diary_list_page.dart`:
```dart
import 'package:flutter/material.dart';

class DiaryListPage extends StatelessWidget {
  const DiaryListPage({super.key});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('日记列表（开发中）')));
}
```

`lib/features/diary/diary_edit_page.dart`:
```dart
import 'package:flutter/material.dart';

class DiaryEditPage extends StatelessWidget {
  const DiaryEditPage({super.key, required this.date});
  final String date;
  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: Text(date)), body: const Center(child: Text('日记编辑（开发中）')));
}
```

`lib/features/auth/login_page.dart`（登录占位，后端 auth 落地后再补）:
```dart
import 'package:flutter/material.dart';

class LoginPage extends StatelessWidget {
  const LoginPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('设置')),
        body: const Center(child: Text('登录功能开发中，后端接入后启用')),
      );
}
```

- [ ] **Step 2: 写 `lib/app_shell.dart`（AppBar + Drawer 侧栏壳）**

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 主壳：AppBar + Drawer 侧栏，包住各模块页面。
/// 模块多、底部 tab 放不下，用滑出侧栏；加模块 = 在 [_items] 加一项。
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  static const _items = <({IconData icon, String label, String path})>[
    (icon: Icons.bolt, label: '闪记', path: '/moments'),
    (icon: Icons.book_outlined, label: '日记', path: '/diary'),
  ];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final selected = _items.indexWhere((e) => location == e.path);

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.menu),
            tooltip: '菜单',
            onPressed: () => Scaffold.of(context).openDrawer(),
          ),
        ),
        title: const Text('Serenique'),
      ),
      drawer: NavigationDrawer(
        selectedIndex: selected < 0 ? null : selected,
        onDestinationSelected: (index) => context.go(_items[index].path),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 20, 16, 8),
            child: Text('Serenique', style: Theme.of(context).textTheme.titleSmall),
          ),
          for (final item in _items)
            NavigationDrawerDestination(icon: Icon(item.icon), label: Text(item.label)),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('设置'),
            onTap: () => context.go('/login'),
          ),
        ],
      ),
      body: child,
    );
  }
}
```

- [ ] **Step 3: 写 `lib/router.dart`（声明式路由）**

注意：`/moments/create` 是字面量，必须注册在 `/moments/:id` **之前**，否则 "create" 会被 `:id` 吃掉。

```dart
import 'package:go_router/go_router.dart';
import 'app_shell.dart';
import 'features/auth/login_page.dart';
import 'features/diary/diary_edit_page.dart';
import 'features/diary/diary_list_page.dart';
import 'features/moment/moment_create_page.dart';
import 'features/moment/moment_detail_page.dart';
import 'features/moment/moment_list_page.dart';

/// 模块页在 Drawer 壳内；详情/编辑/登录页全屏 push。
final appRouter = GoRouter(
  initialLocation: '/moments',
  routes: [
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
```

- [ ] **Step 4: 改 `lib/app.dart` 接 router**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme.dart';
import 'router.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Serenique',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
    );
  }
}
```

- [ ] **Step 5: 写失败测试 `test/app_shell_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:serenique_mobile/app_shell.dart';

void main() {
  GoRouter shellRouter() => GoRouter(
        initialLocation: '/moments',
        routes: [
          ShellRoute(
            builder: (context, state, child) => AppShell(child: child),
            routes: [
              GoRoute(path: '/moments', builder: (_, __) => const Scaffold(body: Text('闪记'))),
              GoRoute(path: '/diary', builder: (_, __) => const Scaffold(body: Text('日记'))),
            ],
          ),
        ],
      );

  testWidgets('Drawer 打开并显示模块', (tester) async {
    await tester.pumpWidget(MaterialApp.router(routerConfig: shellRouter()));
    expect(find.text('闪记'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(NavigationDrawerDestination, '闪记'), findsOneWidget);
    expect(find.widgetWithText(NavigationDrawerDestination, '日记'), findsOneWidget);
  });

  testWidgets('点击日记条目导航到日记页', (tester) async {
    await tester.pumpWidget(MaterialApp.router(routerConfig: shellRouter()));
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDrawerDestination, '日记'));
    await tester.pumpAndSettle();
    expect(find.text('日记'), findsOneWidget);
  });
}
```

- [ ] **Step 6: 门禁 + 提交**

Run: `flutter analyze` → No issues found。
Run: `flutter test` → 全部 PASS。
```bash
git add apps/mobile
git commit -m "feat(mobile): app shell with drawer navigation + go_router"
```

---

## Task 4: moment 数据层（models + api + providers）

**Files:**
- Create: `apps/mobile/lib/features/moment/moment_models.dart`, `apps/mobile/lib/features/moment/moment_api.dart`, `apps/mobile/lib/features/moment/moment_providers.dart`
- Test: `apps/mobile/test/features/moment/moment_models_test.dart`

**Interfaces:**
- Produces: `Moment{id,text,comments,commentCount,createdAt,updatedAt}` + `Moment.fromJson`；`MomentComment{id,momentId,content,createdAt,updatedAt}` + `fromJson`；`MomentApi(client)` with `list/get/create/delete/listComments/addComment/updateComment/deleteComment`；`momentApiProvider`、`momentListProvider`（FutureProvider<List<Moment>>）、`momentDetailProvider`（FutureProvider.family<Moment,String>）、`momentActionsProvider`（Provider<MomentActions>）。
- Consumes: `apiClientProvider`（Task 2）。Task 5/6 的页面用这些 provider。

- [ ] **Step 1: 写 `moment_models.dart`（对齐 `services/api/src/modules/moment/moment.types.ts`）**

```dart
class MomentComment {
  const MomentComment({
    required this.id,
    required this.momentId,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String momentId;
  final String content;
  final String createdAt;
  final String updatedAt;

  factory MomentComment.fromJson(Map<String, dynamic> json) => MomentComment(
        id: json['id'] as String,
        momentId: json['momentId'] as String,
        content: json['content'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}

class Moment {
  const Moment({
    required this.id,
    required this.text,
    required this.comments,
    required this.commentCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String text;
  final List<MomentComment> comments;
  final int commentCount;
  final String createdAt;
  final String updatedAt;

  factory Moment.fromJson(Map<String, dynamic> json) => Moment(
        id: json['id'] as String,
        text: json['text'] as String,
        comments: (json['comments'] as List<dynamic>? ?? const [])
            .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
            .toList(),
        commentCount: json['commentCount'] as int? ?? 0,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
```

- [ ] **Step 2: 写失败测试 `moment_models_test.dart`**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';

void main() {
  test('Moment.fromJson 解析字段 + 内嵌评论', () {
    final m = Moment.fromJson({
      'id': 'm1',
      'text': '今天天气不错',
      'attachments': <Object>[],
      'comments': [
        {'id': 'c1', 'momentId': 'm1', 'content': '同意', 'createdAt': 't', 'updatedAt': 't'},
      ],
      'commentCount': 1,
      'createdAt': 't',
      'updatedAt': 't',
    });
    expect(m.id, 'm1');
    expect(m.text, '今天天气不错');
    expect(m.comments.single.content, '同意');
    expect(m.commentCount, 1);
  });

  test('Moment.fromJson 缺 comments 时默认为空', () {
    final m = Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'});
    expect(m.comments, isEmpty);
    expect(m.commentCount, 0);
  });
}
```

- [ ] **Step 3: 运行测试验证失败**

Run: `flutter test test/features/moment/moment_models_test.dart` → Expected: FAIL（找不到 `Moment` / 文件不存在）。

- [ ] **Step 4: 写 `moment_api.dart`**

```dart
import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';
import 'moment_models.dart';

/// moment 的 HTTP 封装：只负责「请求 + 把 data 解成模型」。
class MomentApi {
  MomentApi(this._client);

  final ApiClient _client;

  Future<List<Moment>> list({int page = 1, int pageSize = 50}) async {
    final data = await _client
        .getData('/api/moments', query: {'page': page, 'pageSize': pageSize});
    return unwrapItems(data)
        .map((e) => Moment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Moment> get(String id) async {
    final data = await _client.getData('/api/moments/$id');
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<Moment> create(String text) async {
    final data = await _client.postData('/api/moments', body: {'text': text});
    return Moment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _client.deleteData('/api/moments/$id');
  }

  Future<List<MomentComment>> listComments(String momentId) async {
    final data = await _client.getData('/api/moments/$momentId/comments');
    return (data as List<dynamic>)
        .map((e) => MomentComment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MomentComment> addComment(String momentId, String content) async {
    final data = await _client
        .postData('/api/moments/$momentId/comments', body: {'content': content});
    return MomentComment.fromJson(data as Map<String, dynamic>);
  }

  Future<MomentComment> updateComment(
      String momentId, String commentId, String content) async {
    final data = await _client.putData('/api/moments/$momentId/comments/$commentId',
        body: {'content': content});
    return MomentComment.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteComment(String momentId, String commentId) async {
    await _client.deleteData('/api/moments/$momentId/comments/$commentId');
  }
}
```

- [ ] **Step 5: 写 `moment_providers.dart`（Riverpod 手写 provider + Actions）**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'moment_api.dart';
import 'moment_models.dart';

final momentApiProvider =
    Provider<MomentApi>((ref) => MomentApi(ref.watch(apiClientProvider)));

/// 闪记列表（服务端状态，≈ TanStack Query 的 query）。
final momentListProvider = FutureProvider<List<Moment>>((ref) async {
  return ref.watch(momentApiProvider).list();
});

/// 闪记详情（含评论）。
final momentDetailProvider =
    FutureProvider.family<Moment, String>((ref, id) async {
  return ref.watch(momentApiProvider).get(id);
});

/// 写操作集中在这里：调用 API 成功后 invalidate 对应列表/详情（≈ invalidateQueries）。
class MomentActions {
  MomentActions(this._ref);

  final Ref _ref;
  MomentApi get _api => _ref.read(momentApiProvider);

  Future<Moment> create(String text) async {
    final created = await _api.create(text);
    _ref.invalidate(momentListProvider);
    return created;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    _ref.invalidate(momentListProvider);
  }

  Future<MomentComment> addComment(String momentId, String content) async {
    final comment = await _api.addComment(momentId, content);
    _ref.invalidate(momentDetailProvider(momentId));
    _ref.invalidate(momentListProvider);
    return comment;
  }

  Future<void> deleteComment(String momentId, String commentId) async {
    await _api.deleteComment(momentId, commentId);
    _ref.invalidate(momentDetailProvider(momentId));
  }
}

final momentActionsProvider =
    Provider<MomentActions>((ref) => MomentActions(ref));
```

- [ ] **Step 6: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/moment` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/features/moment apps/mobile/test/features/moment
git commit -m "feat(mobile): moment data layer (models, api, providers)"
```

---

## Task 5: moment 列表页 + 创建页 + 共享错误视图

**Files:**
- Create: `apps/mobile/lib/shared/widgets/async_view.dart`
- Replace（stub → 实现）: `apps/mobile/lib/features/moment/moment_list_page.dart`, `apps/mobile/lib/features/moment/moment_create_page.dart`
- Test: `apps/mobile/test/features/moment/moment_list_page_test.dart`

**Interfaces:**
- Consumes: `momentListProvider`/`momentActionsProvider`（Task 4）、`humanizeError`（Task 2）、`context.push`（Task 3 路由）。
- Produces: `AsyncErrorView(error, onRetry?)`。

- [ ] **Step 1: 写失败测试 `moment_list_page_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

void main() {
  final sample = Moment(
    id: 'm1',
    text: '第一条闪记',
    comments: const [],
    commentCount: 0,
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('列表页渲染数据', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => [sample])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('第一条闪记'), findsOneWidget);
  });

  testWidgets('空列表显示引导', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => const [])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('还没有闪记，点右下角新建'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `flutter test test/features/moment/moment_list_page_test.dart` → FAIL（页面还是 stub）。

- [ ] **Step 3: 写 `shared/widgets/async_view.dart`**

```dart
import 'package:flutter/material.dart';
import '../../core/network/api_exception.dart';

/// 错误占位视图 + 重试按钮。
class AsyncErrorView extends StatelessWidget {
  const AsyncErrorView({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(humanizeError(error), textAlign: TextAlign.center),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: 替换 `moment_list_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'moment_providers.dart';

class MomentListPage extends ConsumerWidget {
  const MomentListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final moments = ref.watch(momentListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('闪记')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/moments/create'),
        tooltip: '新建闪记',
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(momentListProvider.future),
        child: moments.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(
              error: err, onRetry: () => ref.invalidate(momentListProvider)),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                  children: const [ListTile(title: Text('还没有闪记，点右下角新建'))]);
            }
            return ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final m = items[index];
                return ListTile(
                  title: Text(m.text, maxLines: 2, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${m.commentCount} 条评论'),
                  onTap: () => context.push('/moments/${m.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: 替换 `moment_create_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import 'moment_providers.dart';

class MomentCreatePage extends ConsumerStatefulWidget {
  const MomentCreatePage({super.key});

  @override
  ConsumerState<MomentCreatePage> createState() => _MomentCreatePageState();
}

class _MomentCreatePageState extends ConsumerState<MomentCreatePage> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(momentActionsProvider).create(text);
      if (context.mounted) context.pop();
    } on Exception catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('新建闪记')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _controller,
              maxLength: 500,
              maxLines: 6,
              decoration: const InputDecoration(
                  hintText: '记录此刻的想法…', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('保存'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/moment/moment_list_page_test.dart` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/shared apps/mobile/lib/features/moment apps/mobile/test/features/moment
git commit -m "feat(mobile): moment list + create pages"
```

---

## Task 6: moment 详情页 + 评论

**Files:**
- Replace: `apps/mobile/lib/features/moment/moment_detail_page.dart`
- Create: `apps/mobile/lib/features/moment/widgets/comment_section.dart`
- Test: `apps/mobile/test/features/moment/moment_detail_page_test.dart`

**Interfaces:**
- Consumes: `momentDetailProvider`/`momentActionsProvider`（Task 4）、`AsyncErrorView`（Task 5）。

- [ ] **Step 1: 写失败测试 `moment_detail_page_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_detail_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

void main() {
  final moment = Moment(
    id: 'm1',
    text: '今天的闪记',
    comments: const [
      MomentComment(
          id: 'c1', momentId: 'm1', content: '第一条评论', createdAt: 't', updatedAt: 't'),
    ],
    commentCount: 1,
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('详情页显示文本与评论', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentDetailProvider('m1').overrideWith((ref) async => moment),
      ],
      child: const MaterialApp(home: MomentDetailPage(id: 'm1')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('今天的闪记'), findsOneWidget);
    expect(find.text('第一条评论'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `flutter test test/features/moment/moment_detail_page_test.dart` → FAIL（stub）。

- [ ] **Step 3: 写 `widgets/comment_section.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_exception.dart';
import '../moment_models.dart';
import '../moment_providers.dart';

/// 评论区：列表 + 新增 + 删除。评论数据来自 momentDetailProvider（评论内嵌在详情里）。
class CommentSection extends ConsumerStatefulWidget {
  const CommentSection({super.key, required this.momentId});

  final String momentId;

  @override
  ConsumerState<CommentSection> createState() => _CommentSectionState();
}

class _CommentSectionState extends ConsumerState<CommentSection> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final content = _controller.text.trim();
    if (content.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(momentActionsProvider).addComment(widget.momentId, content);
      _controller.clear();
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _remove(String commentId) async {
    await ref
        .read(momentActionsProvider)
        .deleteComment(widget.momentId, commentId);
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(momentDetailProvider(widget.momentId));
    final comments = detail.hasValue ? detail.value!.comments : <MomentComment>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('评论', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (comments.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('暂无评论'),
          ),
        for (final c in comments)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(c.content),
            subtitle: Text(c.createdAt, style: Theme.of(context).textTheme.bodySmall),
            trailing: IconButton(
              icon: const Icon(Icons.close, size: 18),
              tooltip: '删除评论',
              onPressed: () => _remove(c.id),
            ),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                maxLength: 2000,
                maxLines: 3,
                minLines: 1,
                decoration: const InputDecoration(
                    hintText: '写评论…', border: OutlineInputBorder(), counterText: ''),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _submitting ? null : _add,
              icon: const Icon(Icons.send),
              tooltip: '发送',
            ),
          ],
        ),
      ],
    );
  }
}
```

- [ ] **Step 4: 替换 `moment_detail_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'moment_providers.dart';
import 'widgets/comment_section.dart';

class MomentDetailPage extends ConsumerWidget {
  const MomentDetailPage({super.key, required this.id});

  final String id;

  Future<void> _delete(BuildContext context, WidgetRef ref, String momentId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除这条闪记？'),
        content: const Text('删除后不可恢复。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await ref.read(momentActionsProvider).delete(momentId);
    if (context.mounted) context.pop();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(momentDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('闪记详情')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(
            error: err, onRetry: () => ref.invalidate(momentDetailProvider(id))),
        data: (moment) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(moment.text, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(moment.createdAt, style: Theme.of(context).textTheme.bodySmall),
            const Divider(height: 32),
            CommentSection(momentId: moment.id),
            const SizedBox(height: 88),
          ],
        ),
      ),
      floatingActionButton: detail.hasValue
          ? FloatingActionButton(
              tooltip: '删除',
              onPressed: () => _delete(context, ref, detail.value!.id),
              child: const Icon(Icons.delete_outline),
            )
          : null,
    );
  }
}
```

- [ ] **Step 5: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/moment/moment_detail_page_test.dart` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/features/moment apps/mobile/test/features/moment
git commit -m "feat(mobile): moment detail + comments"
```

---

## Task 7: diary 数据层（models + api + providers）

**Files:**
- Create: `apps/mobile/lib/features/diary/diary_models.dart`, `apps/mobile/lib/features/diary/diary_api.dart`, `apps/mobile/lib/features/diary/diary_providers.dart`
- Test: `apps/mobile/test/features/diary/diary_models_test.dart`

**Interfaces:**
- Produces: `DiaryEntry{id,diaryDate,content,createdAt,updatedAt}` + `fromJson`；`DiaryApi(client)` with `list/getByDate/create/update/delete`；`diaryApiProvider`、`diaryListProvider`（FutureProvider<List<DiaryEntry>>）、`diaryByDateProvider`（FutureProvider.family<DiaryEntry?,String>，当天无返回 null）、`diaryActionsProvider`。
- Consumes: `apiClientProvider`（Task 2）。Task 8 的页面用这些 provider。

- [ ] **Step 1: 写 `diary_models.dart`（对齐 `services/api/src/modules/diary/diary.types.ts`）**

```dart
class DiaryEntry {
  const DiaryEntry({
    required this.id,
    required this.diaryDate,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String diaryDate; // YYYY-MM-DD
  final String content;
  final String createdAt;
  final String updatedAt;

  factory DiaryEntry.fromJson(Map<String, dynamic> json) => DiaryEntry(
        id: json['id'] as String,
        diaryDate: json['diaryDate'] as String,
        content: json['content'] as String,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
```

- [ ] **Step 2: 写失败测试 `diary_models_test.dart`**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/diary/diary_models.dart';

void main() {
  test('DiaryEntry.fromJson 解析', () {
    final e = DiaryEntry.fromJson({
      'id': 'd1',
      'diaryDate': '2026-08-06',
      'content': '今天写了第一篇日记',
      'createdAt': 't',
      'updatedAt': 't',
    });
    expect(e.id, 'd1');
    expect(e.diaryDate, '2026-08-06');
    expect(e.content, '今天写了第一篇日记');
  });
}
```

- [ ] **Step 3: 运行测试验证失败**

Run: `flutter test test/features/diary/diary_models_test.dart` → FAIL。

- [ ] **Step 4: 写 `diary_api.dart`**

```dart
import '../../../core/network/api_client.dart';
import '../../../core/network/unwrap.dart';
import 'diary_models.dart';

/// diary 的 HTTP 封装。
class DiaryApi {
  DiaryApi(this._client);

  final ApiClient _client;

  Future<List<DiaryEntry>> list({int page = 1, int pageSize = 50}) async {
    final data =
        await _client.getData('/api/diaries', query: {'page': page, 'pageSize': pageSize});
    return unwrapItems(data)
        .map((e) => DiaryEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 按日期取（YYYY-MM-DD）。当天没有 → 后端 404 → ApiException(NOT_FOUND)。
  Future<DiaryEntry> getByDate(String date) async {
    final data = await _client.getData('/api/diaries/by-date/$date');
    return DiaryEntry.fromJson(data as Map<String, dynamic>);
  }

  /// 创建。diaryDate 不传时后端默认今天。
  Future<DiaryEntry> create({String? diaryDate, required String content}) async {
    final data = await _client.postData('/api/diaries', body: {
      'content': content,
      if (diaryDate != null) 'diaryDate': diaryDate,
    });
    return DiaryEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<DiaryEntry> update(String id, String content) async {
    final data = await _client.putData('/api/diaries/$id', body: {'content': content});
    return DiaryEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    await _client.deleteData('/api/diaries/$id');
  }
}
```

- [ ] **Step 5: 写 `diary_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'diary_api.dart';
import 'diary_models.dart';

final diaryApiProvider = Provider<DiaryApi>((ref) => DiaryApi(ref.watch(apiClientProvider)));

final diaryListProvider = FutureProvider<List<DiaryEntry>>((ref) async {
  return ref.watch(diaryApiProvider).list();
});

/// 按日期取；当天没有日记 → null（编辑页据此决定新建/编辑）。
final diaryByDateProvider = FutureProvider.family<DiaryEntry?, String>((ref, date) async {
  try {
    return await ref.watch(diaryApiProvider).getByDate(date);
  } on ApiException catch (e) {
    if (e.code == 'NOT_FOUND') return null;
    rethrow;
  }
});

/// 写操作：按「当天是否已有日记」决定 update / create。
class DiaryActions {
  DiaryActions(this._ref);

  final Ref _ref;
  DiaryApi get _api => _ref.read(diaryApiProvider);

  Future<DiaryEntry> save({
    String? existingId,
    required String date,
    required String content,
  }) async {
    final entry = existingId != null
        ? await _api.update(existingId, content)
        : await _api.create(diaryDate: date, content: content);
    _ref.invalidate(diaryByDateProvider(date));
    _ref.invalidate(diaryListProvider);
    return entry;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    _ref.invalidate(diaryListProvider);
  }
}

final diaryActionsProvider = Provider<DiaryActions>((ref) => DiaryActions(ref));
```

- [ ] **Step 6: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/diary` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/features/diary apps/mobile/test/features/diary
git commit -m "feat(mobile): diary data layer (models, api, providers)"
```

---

## Task 8: diary 列表页 + 编辑页

**Files:**
- Replace: `apps/mobile/lib/features/diary/diary_list_page.dart`, `apps/mobile/lib/features/diary/diary_edit_page.dart`
- Test: `apps/mobile/test/features/diary/diary_list_page_test.dart`

**Interfaces:**
- Consumes: `diaryListProvider`/`diaryByDateProvider`/`diaryActionsProvider`（Task 7）、`AsyncErrorView`（Task 5）、`humanizeError`（Task 2）。

- [ ] **Step 1: 写失败测试 `diary_list_page_test.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/diary/diary_list_page.dart';
import 'package:serenique_mobile/features/diary/diary_models.dart';
import 'package:serenique_mobile/features/diary/diary_providers.dart';

void main() {
  final entry = DiaryEntry(
    id: 'd1',
    diaryDate: '2026-08-06',
    content: '今天写了第一篇日记',
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('日记列表渲染', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [diaryListProvider.overrideWith((ref) async => [entry])],
      child: const MaterialApp(home: DiaryListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('2026-08-06'), findsOneWidget);
    expect(find.text('今天写了第一篇日记'), findsOneWidget);
  });
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `flutter test test/features/diary/diary_list_page_test.dart` → FAIL（stub）。

- [ ] **Step 3: 替换 `diary_list_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../shared/widgets/async_view.dart';
import 'diary_providers.dart';

class DiaryListPage extends ConsumerWidget {
  const DiaryListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(diaryListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('日记')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/diary/${DateFormat('yyyy-MM-dd').format(DateTime.now())}'),
        tooltip: '写今天',
        child: const Icon(Icons.edit_outlined),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(diaryListProvider.future),
        child: entries.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) =>
              AsyncErrorView(error: err, onRetry: () => ref.invalidate(diaryListProvider)),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                  children: const [ListTile(title: Text('还没有日记，点右下角写一篇'))]);
            }
            return ListView.builder(
              itemCount: list.length,
              itemBuilder: (context, index) {
                final e = list[index];
                return ListTile(
                  title: Text(e.diaryDate),
                  subtitle:
                      Text(e.content, maxLines: 2, overflow: TextOverflow.ellipsis),
                  onTap: () => context.push('/diary/${e.diaryDate}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: 替换 `diary_edit_page.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'diary_providers.dart';

class DiaryEditPage extends ConsumerStatefulWidget {
  const DiaryEditPage({super.key, required this.date});

  final String date; // YYYY-MM-DD

  @override
  ConsumerState<DiaryEditPage> createState() => _DiaryEditPageState();
}

class _DiaryEditPageState extends ConsumerState<DiaryEditPage> {
  final _controller = TextEditingController();
  bool _loaded = false;
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final content = _controller.text.trim();
    if (content.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    final existingId = ref.read(diaryByDateProvider(widget.date)).value?.id;
    setState(() => _saving = true);
    try {
      await ref.read(diaryActionsProvider).save(
            existingId: existingId,
            date: widget.date,
            content: content,
          );
      if (context.mounted) context.pop();
    } on Exception catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final existing = ref.read(diaryByDateProvider(widget.date)).value;
    if (existing == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除这篇日记？'),
        content: const Text('删除后不可恢复。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await ref.read(diaryActionsProvider).delete(existing.id);
    if (context.mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final entry = ref.watch(diaryByDateProvider(widget.date));
    if (!_loaded && entry.hasValue) {
      _loaded = true;
      _controller.text = entry.value?.content ?? '';
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.date),
        actions: [
          if (entry.hasValue && entry.value != null)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: '删除日记',
              onPressed: _delete,
            ),
        ],
      ),
      body: entry.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(
            error: err, onRetry: () => ref.invalidate(diaryByDateProvider(widget.date))),
        data: (_) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  maxLines: null,
                  expands: true,
                  textAlignVertical: TextAlignVertical.top,
                  decoration: const InputDecoration(
                      hintText: '写下今天的日记…', border: OutlineInputBorder()),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('保存'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: 运行测试验证通过 + 门禁 + 提交**

Run: `flutter test test/features/diary` → PASS。
Run: `flutter analyze` → No issues found。
```bash
git add apps/mobile/lib/features/diary apps/mobile/test/features/diary
git commit -m "feat(mobile): diary list + edit pages"
```

---

## Task 9: iOS ATS + 真机验证 + 收尾

**Files:**
- Modify: `apps/mobile/ios/Runner/Info.plist`, `apps/mobile/README.md`
- Create: `.ai/worklog/2026-08-06-flutter-mobile-v1-dev.md`

- [ ] **Step 1: Info.plist 加 ATS 例外（开发期连 Mac 局域网 HTTP）**

在 `apps/mobile/ios/Runner/Info.plist` 的 `<dict>` 内（`</dict>` 前）加：

```xml
	<key>NSAppTransportSecurity</key>
	<dict>
		<!-- 开发期允许明文 HTTP（连 Mac 局域网 API）。发布前收紧。 -->
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
```

- [ ] **Step 2: 全量门禁**

Run: `flutter analyze` → No issues found。
Run: `flutter test` → 全部 PASS。

- [ ] **Step 3: 真机运行验证**

确保 Mac 上 API 在跑（`services/api` 的 `bun run dev`，端口 3000），且手机与 Mac 同一局域网。Run（目录 `apps/mobile`，带代理）：
```sh
cd apps/mobile
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 \
flutter run -d hpcell --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000
```
Expected: App 安装启动；闪记列表页加载出后端数据（或连通后端时正常展示）。若 ATS 报错，检查 Step 1 已生效；若连接失败，`curl http://<Mac局域网IP>:3000/health` 确认 API 可达。
验证点（手动）：Drawer 可在闪记/日记间切换；新建闪记后列表刷新；闪记详情可加评论/删除；日记按日期新建/编辑/删除。

- [ ] **Step 4: 更新 `apps/mobile/README.md`**

补上：技术栈一行（Material3 + dio + Riverpod3 + go_router）、`flutter pub get` / `flutter run` 带代理命令、`--dart-define=API_BASE_URL` 用法、免费签名 7 天过期提示。

- [ ] **Step 5: 写 `.ai/worklog/2026-08-06-flutter-mobile-v1-dev.md`**

记录：本次建成哪些模块、跑通真机的验证结果、对下一次会话的提示（代理、ATS、免费签名、`/moments/create` 需在 `/moments/:id` 前注册）。

- [ ] **Step 6: 提交**

```bash
git add apps/mobile ios/Runner 2>/dev/null
git add apps/mobile apps/mobile/ios
git add .ai/worklog/2026-08-06-flutter-mobile-v1-dev.md
git commit -m "feat(mobile): v1 complete (moment + diary, drawer nav); add ATS dev exception"
```

---

## Self-Review 结果

- **Spec 覆盖**：技术栈（T1/T2/T3）、目录结构（T1-T8 依 spec §3 建）、数据流 FutureProvider+invalidate（T4/T7）、路由+Drawer（T3）、契约解包/items+total/text≤500/comment≤2000/diary 日期（T2/T4/T6/T7）、错误处理（T2 humanizeError + 各页）、环境/iOS ATS/代理（T9）、测试（每任务）、v1 范围=登录占位+Diary+Moment（T3/T4-T8）。`flutter_secure_storage` 按 spec 明确不在 v1。
- **无占位符**：所有步骤均含完整可运行代码；stub 页在后续任务被显式替换。
- **类型一致性**：`MomentApi.list → List<Moment>`、`momentListProvider → FutureProvider<List<Moment>>`、override 返回 `[sample]` 一致；`humanizeError` 定义（T2）被 T5/T6/T8 引用；`DiaryActions.save(existingId, date, content)` 与编辑页调用一致；路由 `/moments/create` 在 `/moments/:id` 之前注册（已加注释）。
