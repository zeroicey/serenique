import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/settings/settings_page.dart';
import '../../helpers.dart';

void main() {
  testWidgets('显示已登录、打码密钥与退出登录按钮', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(FakeTokenStorage('0123456789abcdef')),
      ],
      child: const MaterialApp(home: SettingsPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('已登录'), findsOneWidget);
    expect(find.text('0123…cdef'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
  });

  testWidgets('点击退出登录清除认证态', (tester) async {
    final storage = FakeTokenStorage('0123456789abcdef');
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(storage),
      ],
      child: const MaterialApp(home: SettingsPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('已登录'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, '退出登录'));
    await tester.pumpAndSettle();

    expect(storage.value, isNull);
    expect(find.text('已登录'), findsNothing);
  });
}
