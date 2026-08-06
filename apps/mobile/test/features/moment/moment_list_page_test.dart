import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

void main() {
  final sample = Moment(
    id: 'm1',
    text: '第一条闪记',
    comments: const [],
    commentCount: 0,
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('列表页渲染数据', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => [sample])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('第一条闪记'), findsOneWidget);
  });

  testWidgets('空列表显示引导', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => const [])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('还没有闪记，点右下角新建'), findsOneWidget);
  });
}
