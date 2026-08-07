import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import '../../helpers.dart';

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
    await tester.tap(find.widgetWithText(FilledButton, '登录'));
    await tester.pumpAndSettle();
    expect(find.text('密钥错误，请检查后重试'), findsOneWidget);
  });
}
