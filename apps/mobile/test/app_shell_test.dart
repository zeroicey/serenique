import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:serenique_mobile/app_shell.dart';
import 'package:serenique_mobile/features/moment/moment_create_page.dart';
import 'package:serenique_mobile/features/task/task_edit_page.dart';
import 'package:serenique_mobile/providers.dart';

void main() {
  GoRouter shellRouter() => GoRouter(
        initialLocation: '/moments',
        routes: [
          ShellRoute(
            builder: (context, state, child) => AppShell(child: child),
            routes: [
              GoRoute(path: '/moments', builder: (_, _) => const Scaffold(body: Text('闪记'))),
              GoRoute(path: '/task', builder: (_, _) => const Scaffold(body: Text('任务页'))),
              GoRoute(path: '/settings', builder: (_, _) => const Scaffold(body: Text('设置页'))),
            ],
          ),
          // 与真实 router.dart 一致：发布/编辑页在 ShellRoute 之外，自持 Scaffold/AppBar。
          GoRoute(path: '/moments/create', builder: (_, _) => const MomentCreatePage()),
          GoRoute(
            path: '/task/edit',
            builder: (_, state) =>
                TaskEditPage(args: (state.extra as TaskEditArgs?) ?? const TaskEditArgs()),
          ),
        ],
      );

  // AppShell 的 Scaffold 是树里第一个（它包住子页面的 Scaffold）。
  ScaffoldState shellScaffoldState(WidgetTester tester) =>
      tester.state<ScaffoldState>(find.byType(Scaffold).first);

  testWidgets('Drawer 打开并显示模块', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    // 顶部标题动态显示当前模块名
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('闪记')), findsOneWidget);
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, '闪记'), findsOneWidget);
  });

  testWidgets('AppBar 按路由显示添加按钮', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    expect(find.byIcon(Icons.add), findsOneWidget); // /moments：新建闪记
    expect(find.byIcon(Icons.edit_outlined), findsNothing);

    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, '闪记'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.add), findsOneWidget); // 仍在 /moments
  });

  testWidgets('任务页 AppBar 显示新建任务按钮并跳转编辑页', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, '任务'));
    await tester.pumpAndSettle();
    // 右上角出现新建任务按钮
    expect(find.byTooltip('新建任务'), findsOneWidget);
    await tester.tap(find.byTooltip('新建任务'));
    await tester.pumpAndSettle();
    // 进入全屏编辑页（AppBar 标题 = 新建任务）
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('新建任务')), findsOneWidget);
  });

  testWidgets('点击设置：跳转设置页且侧边栏自动关闭', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(shellScaffoldState(tester).isDrawerOpen, isTrue);

    await tester.tap(find.text('设置'));
    await tester.pumpAndSettle();

    expect(find.text('设置页'), findsOneWidget);
    expect(shellScaffoldState(tester).isDrawerOpen, isFalse);
  });

  testWidgets('短按 + 弹出附件选择弹层', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('新建闪记'));
    await tester.pumpAndSettle();
    expect(find.text('拍照'), findsOneWidget);
    expect(find.text('录像'), findsOneWidget);
    expect(find.text('从手机相册选择'), findsOneWidget);
    expect(find.text('取消'), findsOneWidget);
    expect(find.text('选文件'), findsNothing);
  });

  testWidgets('弹层点取消：不跳转发布页', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('新建闪记'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(find.text('发表'), findsNothing); // 未进入发布页
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('闪记')), findsOneWidget);
  });

  testWidgets('长按 + 直接进入发布页', (tester) async {
    await tester.pumpWidget(ProviderScope(overrides: [countsProvider.overrideWith((ref) async => 3)], child: MaterialApp.router(routerConfig: shellRouter())));
    await tester.pumpAndSettle();
    await tester.longPress(find.byTooltip('新建闪记'));
    await tester.pumpAndSettle();
    expect(find.text('发表'), findsOneWidget); // 发布页按钮，真正确认已跳转
    expect(find.text('新建闪记'), findsWidgets); // 发布页 AppBar 标题
  });
}
