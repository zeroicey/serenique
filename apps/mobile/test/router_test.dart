import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/audit/audit_models.dart';
import 'package:serenique_mobile/features/audit/audit_page.dart';
import 'package:serenique_mobile/features/audit/audit_providers.dart';
import 'package:serenique_mobile/features/auth/auth_api.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'package:serenique_mobile/features/auth/webauthn.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/settings/settings_page.dart';
import 'package:serenique_mobile/features/settings/settings_providers.dart';
import 'package:serenique_mobile/features/task/task_providers.dart';
import 'package:serenique_mobile/providers.dart';
import 'package:serenique_mobile/router.dart';
import 'helpers.dart';

/// 登录成功路径用的假 AuthApi（login/start+finish 返回会话）。
class _StubAuthApi extends AuthApi {
  _StubAuthApi() : super(ApiClient(baseUrl: 'http://x', sessionReader: () => null));

  @override
  Future<({String challengeId, Map<String, dynamic> options})>
      loginStart() async {
    return (challengeId: 'c1', options: {'challenge': 'Y2g', 'rpId': 'x'});
  }

  @override
  Future<CeremonyResult> loginFinish({
    required String challengeId,
    required Map<String, dynamic> credential,
  }) async {
    return (data: {'authenticated': true}, sessionCookie: 'sess123');
  }
}

void main() {
  testWidgets('无 session：落在 /login', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
      registerGateProvider.overrideWith((ref) async => RegisterGateStatus.ready),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);
  });

  testWidgets('有 session：落在 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('sess123')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(MomentListPage), findsOneWidget);
  });

  testWidgets('已登录：/login 重定向到 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('sess123')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
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

  testWidgets('已登录：/settings 显示三 tab 设置页', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('sess123')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
      // 设置页数据走假实现，避免真实 HTTP（dio 的 timeout timer 会在测试结束时 pending）
      profileProvider.overrideWith(
        (ref) async => const UserEntry(
          id: 'u1',
          name: '张三',
          email: null,
          birthday: null,
          createdAt: '',
          updatedAt: '',
        ),
      ),
      credentialsProvider.overrideWith((ref) async => const <CredentialEntry>[]),
      tokensProvider.overrideWith((ref) async => const <TokenEntry>[]),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(MomentListPage), findsOneWidget);

    container.read(appRouterProvider).go('/settings');
    await tester.pumpAndSettle();

    // 设置页挂在 ShellRoute 内：AppBar（菜单）+ Drawer 可用，可随时返回
    expect(find.byType(SettingsPage), findsOneWidget);
    expect(find.text('个人信息'), findsOneWidget);
    expect(find.text('登录凭证'), findsOneWidget);
    expect(find.text('API 令牌'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
  });

  testWidgets('已登录：/audit 渲染真实日志页（非占位）', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('sess123')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditListProvider.overrideWith(
          (ref) async => const AuditLogPage(items: [], total: 0)),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
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

  testWidgets('通行密钥登录成功：从 /login 显式进 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
      registerGateProvider.overrideWith((ref) async => RegisterGateStatus.ready),
      authApiProvider.overrideWithValue(_StubAuthApi()),
      passkeyCeremonyProvider.overrideWithValue(FakePasskeyCeremony(
        authenticateResult: {'id': 'cred', 'response': {}},
      )),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
      countsProvider.overrideWith((ref) async => 0),
      auditUnreadCountProvider.overrideWith((ref) async => 0),
      taskTodoCountProvider.overrideWith((ref) async => 0),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, '使用通行密钥登录'));
    await tester.pumpAndSettle();

    expect(find.byType(MomentListPage), findsOneWidget);
  });
}
