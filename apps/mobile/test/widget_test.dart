import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:serenique_mobile/app.dart';

void main() {
  testWidgets('App 冒烟测试：可构建', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    expect(find.text('Serenique'), findsOneWidget);
  });
}
