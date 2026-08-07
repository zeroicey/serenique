import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
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

  testWidgets('当天日记完整显示，历史日记两行截断', (tester) async {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final todayContent = '今天的内容' * 100;
    final histContent = '历史的内容' * 100;
    final entries = [
      DiaryEntry(
          id: 't', diaryDate: today, content: todayContent, createdAt: 't', updatedAt: 't'),
      DiaryEntry(
          id: 'h',
          diaryDate: '2026-08-01',
          content: histContent,
          createdAt: 't',
          updatedAt: 't'),
    ];
    await tester.pumpWidget(ProviderScope(
      overrides: [diaryListProvider.overrideWith((ref) async => entries)],
      child: const MaterialApp(home: DiaryListPage()),
    ));
    await tester.pumpAndSettle();

    final todayText = tester.widget<Text>(find.text(todayContent));
    expect(todayText.maxLines, isNull); // 当天全量展示

    final histText = tester.widget<Text>(find.text(histContent));
    expect(histText.maxLines, 2); // 历史两行截断
  });
}
