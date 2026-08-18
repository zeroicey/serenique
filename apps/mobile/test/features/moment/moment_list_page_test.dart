import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_list_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/tag/tag_providers.dart';
import '../../helpers.dart';

/// 评论输入框：搜索栏（SearchBar 内部也是 TextField）常驻，必须用 hint 区分。
Finder get _commentInput => find.byWidgetPredicate(
  (w) => w is TextField && w.decoration?.hintText == '写评论…',
);

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
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([sample]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('第一条闪记'), findsOneWidget);
  });

  testWidgets('空列表显示引导', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier(const []),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('还没有闪记，点右下角新建'), findsOneWidget);
  });

  testWidgets('有评论时评论直接显示在列表里，不显示条数', (tester) async {
    final withComments = Moment(
      id: 'm2',
      text: '第二条闪记',
      comments: const [
        MomentComment(
          id: 'c1',
          momentId: 'm2',
          content: '内联评论',
          createdAt: 't',
          updatedAt: 't',
        ),
      ],
      commentCount: 1,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([withComments]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    // 评论文字嵌在 Text.rich（WidgetSpan 头像）里，toPlainText 开头含 U+FFFC，用包含匹配。
    expect(find.textContaining('内联评论', findRichText: true), findsOneWidget);
    expect(find.textContaining('条评论'), findsNothing);
  });

  testWidgets('长文本显示「全文」并可展开收起', (tester) async {
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
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(() => FakeMomentListNotifier([long])),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('全文'), findsOneWidget);
    expect(find.text('收起'), findsNothing);

    await tester.tap(find.text('全文'));
    await tester.pumpAndSettle();
    expect(find.text('收起'), findsOneWidget);
  });

  testWidgets('卡片 ⋮ 菜单包含评论与删除', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([sample]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('评论'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);
  });

  testWidgets('评论输入默认隐藏，点 ⋮ →「评论」才显示', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([sample]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    expect(_commentInput, findsNothing); // 默认不显示评论输入框（搜索栏除外）

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(find.text('评论'));
    await tester.pumpAndSettle();
    expect(_commentInput, findsOneWidget); // 点「评论」后出现
  });

  testWidgets('再点一次「评论」关闭输入框', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([sample]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();

    // 打开
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(find.text('评论'));
    await tester.pumpAndSettle();
    expect(_commentInput, findsOneWidget);

    // 再点 ⋮ →「评论」→ 关闭
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(find.text('评论'));
    await tester.pumpAndSettle();
    expect(_commentInput, findsNothing);
  });

  testWidgets('搜索栏：输入后 300ms 防抖触发过滤，无结果显示空态', (tester) async {
    final second = Moment(
      id: 'm2',
      text: '第二条闪记',
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([sample, second]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('第一条闪记'), findsOneWidget);
    expect(find.text('第二条闪记'), findsOneWidget);

    // 输入未到 300ms：不触发搜索（列表不变）。
    await tester.enterText(find.byType(SearchBar), '第一条');
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('第一条闪记'), findsOneWidget);
    expect(find.text('第二条闪记'), findsOneWidget);

    // 满 300ms 防抖：触发搜索，仅剩匹配项。
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(find.text('第一条闪记'), findsOneWidget);
    expect(find.text('第二条闪记'), findsNothing);

    // 换成不存在的词：空态。
    await tester.enterText(find.byType(SearchBar), '不存在的关键词');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('未找到匹配的闪记'), findsOneWidget);
  });

  testWidgets('搜索栏：清除按钮清空关键词并恢复全量', (tester) async {
    final second = Moment(
      id: 'm2',
      text: '第二条闪记',
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([sample, second]),
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();

    // 有输入时清除按钮出现；点击后关键词清空、列表恢复全量。
    await tester.enterText(find.byType(SearchBar), '第一条');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('第二条闪记'), findsNothing);
    expect(find.byIcon(Icons.close), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.text('第一条闪记'), findsOneWidget);
    expect(find.text('第二条闪记'), findsOneWidget);
    expect(find.byIcon(Icons.close), findsNothing);
  });

  testWidgets('标签过滤：显示当前过滤 chip，仅展示匹配闪记，可清除', (tester) async {
    final tagged = Moment(
      id: 'm1',
      text: '带标签的闪记',
      tags: const [MomentTag(id: 't1', name: '工作', momentCount: 2)],
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    final other = Moment(
      id: 'm2',
      text: '无关闪记',
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          momentListProvider.overrideWith(
            () => FakeMomentListNotifier([tagged, other]),
          ),
          // 预置过滤条件 + 标签列表（供 chip 名称展示）。
          momentTagFilterProvider.overrideWith(() => _TagFilter('t1')),
          tagsProvider.overrideWith(
            (ref) async => [
              const MomentTag(id: 't1', name: '工作', momentCount: 2),
            ],
          ),
        ],
        child: const MaterialApp(home: MomentListPage()),
      ),
    );
    await tester.pumpAndSettle();

    // 过滤 chip 出现（InputChip），列表只剩匹配项
    expect(find.byType(InputChip), findsOneWidget);
    expect(find.text('带标签的闪记'), findsOneWidget);
    expect(find.text('无关闪记'), findsNothing);

    // 点 chip 本体 → 清除过滤，恢复全量
    await tester.tap(find.byType(InputChip));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNothing);
    expect(find.text('无关闪记'), findsOneWidget);
  });
}

/// 预置固定标签过滤值的 Notifier（供测试初始化过滤态）。
class _TagFilter extends MomentTagFilterNotifier {
  _TagFilter(this.value);

  final String? value;

  @override
  String? build() => value;
}
