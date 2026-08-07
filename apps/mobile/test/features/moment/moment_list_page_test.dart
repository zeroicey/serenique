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

  testWidgets('有评论时评论直接显示在列表里，不显示条数', (tester) async {
    final withComments = Moment(
      id: 'm2',
      text: '第二条闪记',
      comments: const [
        MomentComment(
            id: 'c1', momentId: 'm2', content: '内联评论', createdAt: 't', updatedAt: 't'),
      ],
      commentCount: 1,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => [withComments])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('内联评论'), findsOneWidget);
    expect(find.textContaining('条评论'), findsNothing);
  });

  testWidgets('长文本显示向下箭头并可展开收起', (tester) async {
    tester.view.physicalSize = const Size(400, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final long = Moment(
      id: 'm3',
      text: List.filled(30, '这是一段很长的文字，用来触发展开。').join(''),
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => [long])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.expand_more), findsOneWidget);
    expect(find.byIcon(Icons.expand_less), findsNothing);

    await tester.tap(find.byIcon(Icons.expand_more));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.expand_less), findsOneWidget);
  });

  testWidgets('卡片 ⋮ 菜单包含评论与删除', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => [sample])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('评论'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);
  });

  testWidgets('每张卡片都有内联评论输入框', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [momentListProvider.overrideWith((ref) async => [sample])],
      child: const MaterialApp(home: MomentListPage()),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('写评论…'), findsOneWidget);
  });
}
