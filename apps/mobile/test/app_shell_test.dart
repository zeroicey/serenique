import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:serenique_mobile/app_shell.dart';
import 'package:serenique_mobile/providers.dart';

void main() {
  GoRouter shellRouter() => GoRouter(
        initialLocation: '/moments',
        routes: [
          ShellRoute(
            builder: (context, state, child) => AppShell(child: child),
            routes: [
              GoRoute(path: '/moments', builder: (_, _) => const Scaffold(body: Text('闪记'))),
              GoRoute(path: '/diary', builder: (_, _) => const Scaffold(body: Text('日记'))),
              GoRoute(path: '/settings', builder: (_, _) => const Scaffold(body: Text('设置页'))),
            ],
          ),
        ],
      );

  // AppShell 的 Scaffold 是树里第一个（它包住子页面的 Scaffold）。
  ScaffoldState shellScaffoldState(WidgetTester tester) =>
      tester.state<ScaffoldState>(find.byType(Scaffold).first);

  testWidgets('Drawer 打开并显示模块', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => (moments: 3, diaries: 5))], child: MaterialApp.router(routerConfig: shellRouter())));
    expect(find.text('闪记'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, '闪记'), findsOneWidget);
    expect(find.widgetWithText(ListTile, '日记'), findsOneWidget);
  });

  testWidgets('点击日记条目导航到日记页', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => (moments: 3, diaries: 5))], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, '日记'));
    await tester.pumpAndSettle();
    expect(find.text('日记'), findsOneWidget);
  });

  testWidgets('AppBar 按路由显示添加按钮', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => (moments: 3, diaries: 5))], child: MaterialApp.router(routerConfig: shellRouter())));
    expect(find.byIcon(Icons.add), findsOneWidget); // /moments：新建闪记
    expect(find.byIcon(Icons.edit_outlined), findsNothing);

    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, '日记'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.edit_outlined), findsOneWidget); // /diary：写今天
    expect(find.byIcon(Icons.add), findsNothing);
  });

  testWidgets('点击设置：跳转设置页且侧边栏自动关闭', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => (moments: 3, diaries: 5))], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(shellScaffoldState(tester).isDrawerOpen, isTrue);

    await tester.tap(find.text('设置'));
    await tester.pumpAndSettle();

    expect(find.text('设置页'), findsOneWidget);
    expect(shellScaffoldState(tester).isDrawerOpen, isFalse);
  });
}
