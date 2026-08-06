import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_detail_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

void main() {
  final moment = Moment(
    id: 'm1',
    text: '今天的闪记',
    comments: const [
      MomentComment(
          id: 'c1', momentId: 'm1', content: '第一条评论', createdAt: 't', updatedAt: 't'),
    ],
    commentCount: 1,
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('详情页显示文本与评论', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentDetailProvider('m1').overrideWith((ref) async => moment),
      ],
      child: const MaterialApp(home: MomentDetailPage(id: 'm1')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('今天的闪记'), findsOneWidget);
    expect(find.text('第一条评论'), findsOneWidget);
  });
}
