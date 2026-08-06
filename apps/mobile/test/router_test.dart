import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/auth/auth_providers.dart';
import 'package:serenique_mobile/features/auth/login_page.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
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
}
