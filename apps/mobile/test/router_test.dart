import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_page.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:serenique_mobile/features/audit/audit_models.dart';
import 'package:serenique_mobile/features/audit/audit_page.dart';
import 'package:serenique_mobile/features/audit/audit_providers.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'package:serenique_mobile/features/event/event_page.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/settings/settings_page.dart';
import 'package:serenique_mobile/features/task/task_providers.dart';
import 'package:serenique_mobile/providers.dart';
import 'package:serenique_mobile/router.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'helpers.dart';

class _AiFakeWsChannel implements WebSocketChannel {
  final _incoming = StreamController<Object?>.broadcast();
  @override
  Stream get stream => _incoming.stream;
  @override
  WebSocketSink get sink => _Sink();
  @override
  Future<void> get ready => Future.value();
  @override
  int? get closeCode => null;
  @override
  String? get closeReason => null;
  @override
  String? get protocol => null;

  // WebSocketChannel 在 web_socket_channel 3.x 中同时实现 StreamChannelMixin，
  // 其余成员（pipe/transform/cast 等）测试中不会用到，运行时调用即报错。
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnsupportedError(
      '_AiFakeWsChannel.${invocation.memberName} not used in tests');
}

class _Sink implements WebSocketSink {
  @override
  void add(Object? data) {}
  @override
  void addError(Object error, [StackTrace? stackTrace]) {}
  @override
  Future<void> addStream(Stream stream) async {}
  @override
  Future<void> close([int? closeCode, String? closeReason]) async {}
  @override
  Future<void> get done => Future.value();
}

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
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(MomentListPage), findsOneWidget);
  });

  testWidgets('已登录：/login 重定向到 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(MomentListPage), findsOneWidget);

    container.read(appRouterProvider).go('/login');
    await tester.pumpAndSettle();

    // /login 已认证不再可达：重定向回主界面，登录页只做表单
    expect(find.byType(MomentListPage), findsOneWidget);
    expect(find.byType(LoginPage), findsNothing);
  });

  testWidgets('已登录：/settings 显示已登录态（登出口）', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(MomentListPage), findsOneWidget);

    container.read(appRouterProvider).go('/settings');
    await tester.pumpAndSettle();

    // 设置页挂在 ShellRoute 内：AppBar（菜单）+ Drawer 可用，可随时返回
    expect(find.byType(SettingsPage), findsOneWidget);
    expect(find.text('已登录'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
  });

  testWidgets('已登录：/audit 渲染真实日志页（非占位）', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditListProvider.overrideWith(
          (ref) async => const AuditLogPage(items: [], total: 0)),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();

    container.read(appRouterProvider).go('/audit');
    await tester.pumpAndSettle();

    // 空态文案证明是真实日志页（占位页只会显示「功能开发中」）
    expect(find.byType(AuditPage), findsOneWidget);
    expect(find.text('没有未读日志'), findsOneWidget);
    expect(find.text('全部已读'), findsOneWidget);
  });

  testWidgets('登录成功：从 /login 显式进 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
      verifyTokenProvider.overrideWithValue((token) async {}),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'secret');
    await tester.tap(find.widgetWithText(FilledButton, '登录'));
    await tester.pumpAndSettle();

    expect(find.byType(MomentListPage), findsOneWidget);
  });

  testWidgets('已登录：/ai 渲染真实聊天页（非占位）', (tester) async {
    final channels = <dynamic>[];
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
      aiClientFactoryProvider.overrideWithValue(() => AiClient(
            baseUrl: 'https://api.example.com',
            tokenReader: () => null,
            channelFactory: (uri, headers) {
              final ch = _AiFakeWsChannel();
              channels.add(ch);
              return ch;
            },
          )),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();

    container.read(appRouterProvider).go('/ai');
    await tester.pumpAndSettle();

    // 空态/输入框证明是真实聊天页（占位页只显示「功能开发中」）
    expect(find.byType(AiPage), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('已登录：/event 渲染真实日程页（非占位）', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      eventTodayCountProvider.overrideWith((ref) async => 0),
      eventsForDayProvider.overrideWith((ref, day) async => const []),
      eventsInMonthProvider.overrideWith((ref, month) async => const []),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();

    container.read(appRouterProvider).go('/event');
    await tester.pumpAndSettle();

    // 空态文案证明是真实日程页（占位页只会显示「功能开发中」）
    expect(find.byType(EventPage), findsOneWidget);
    expect(find.text('这天没有日程'), findsOneWidget);
    // AppBar 标题区 = 日期导航（默认今天，eventSelectedDayProvider 无 IO）
    expect(find.text(dateLabel(todayKey())), findsOneWidget);
  });
}
