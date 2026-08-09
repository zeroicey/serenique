import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'helpers.dart';

void main() {
  testWidgets('App 冒烟测试：未登录落在登录页', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(FakeTokenStorage()),
        registerGateProvider.overrideWith((ref) async => RegisterGateStatus.ready),
      ],
      child: const App(),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);
  });
}
