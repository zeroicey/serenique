import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:serenique_mobile/app.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

void main() {
  testWidgets('App 冒烟测试：可构建', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentListProvider.overrideWith((ref) async => const <Moment>[]),
      ],
      child: const App(),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Serenique'), findsOneWidget);
  });
}
