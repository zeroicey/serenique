import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_detail_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

/// 假写操作：记录 deleteComment，不走网络。
class _FakeActions extends MomentActions {
  _FakeActions(super.ref);

  final deleted = <String>[];

  @override
  Future<void> deleteComment(String momentId, String commentId) async {
    deleted.add(commentId);
  }
}

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
    // 评论文字嵌在 Text.rich（WidgetSpan 头像）里，toPlainText 开头含 U+FFFC，用包含匹配。
    expect(find.textContaining('第一条评论', findRichText: true), findsOneWidget);
    expect(find.byIcon(Icons.delete_outline), findsOneWidget); // 删除在右上角标题栏
    expect(find.byType(FloatingActionButton), findsNothing); // 不在右下角 FAB
  });

  testWidgets('长按评论 → 底部弹层 → 删除', (tester) async {
    late _FakeActions fake;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentDetailProvider('m1').overrideWith((ref) async => moment),
        momentActionsProvider.overrideWith((ref) => fake = _FakeActions(ref)),
      ],
      child: const MaterialApp(home: MomentDetailPage(id: 'm1')),
    ));
    await tester.pumpAndSettle();

    // 长按评论 → 底部弹层（删除 / 取消）
    await tester.longPress(find.textContaining('第一条评论', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.text('删除这条评论？'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);
    expect(find.text('取消'), findsNothing); // 点空白处自动取消，不设取消按钮

    // 点删除 → deleteComment 被调用
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();
    expect(fake.deleted, ['c1']);
  });
}
