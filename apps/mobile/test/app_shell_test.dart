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
              GoRoute(path: '/moments', builder: (_, _) => const Scaffold(body: Text('闪记'))),
              GoRoute(path: '/diary', builder: (_, _) => const Scaffold(body: Text('日记'))),
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
