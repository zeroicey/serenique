import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/diary/diary_edit_page.dart';
import 'package:serenique_mobile/features/diary/diary_models.dart';
import 'package:serenique_mobile/features/diary/diary_providers.dart';

void main() {
  testWidgets('编辑页：保存按钮在右上角，正文无边框', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        diaryByDateProvider('2026-08-07').overrideWith((ref) async => null),
      ],
      child: const MaterialApp(home: DiaryEditPage(date: '2026-08-07')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('保存'), findsOneWidget);
    expect(find.text('写下今天的日记…'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('已存在日记时右上角显示删除按钮并回填内容', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        diaryByDateProvider('2026-08-06').overrideWith(
          (ref) async => DiaryEntry(
            id: 'd1',
            diaryDate: '2026-08-06',
            content: '已有内容',
            createdAt: 't',
            updatedAt: 't',
          ),
        ),
      ],
      child: const MaterialApp(home: DiaryEditPage(date: '2026-08-06')),
    ));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.delete_outline), findsOneWidget);
    expect(find.text('已有内容'), findsOneWidget);
  });
}
