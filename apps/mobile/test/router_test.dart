import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/settings/settings_page.dart';
import 'package:serenique_mobile/router.dart';
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

  testWidgets('已登录：/login 重定向到 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
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

  testWidgets('登录成功：从 /login 显式进 /moments', (tester) async {
    final container = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
      verifyTokenProvider.overrideWithValue((token) async {}),
      momentListProvider.overrideWith((ref) async => const <Moment>[]),
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
}
