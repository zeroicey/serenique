import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/diary/diary_list_page.dart';
import 'package:serenique_mobile/features/diary/diary_models.dart';
import 'package:serenique_mobile/features/diary/diary_providers.dart';

void main() {
  final entry = DiaryEntry(
    id: 'd1',
    diaryDate: '2026-08-06',
    content: '今天写了第一篇日记',
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('日记列表渲染', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [diaryListProvider.overrideWith((ref) async => [entry])],
      child: const MaterialApp(home: DiaryListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('2026-08-06'), findsOneWidget);
    expect(find.text('今天写了第一篇日记'), findsOneWidget);
  });
}
