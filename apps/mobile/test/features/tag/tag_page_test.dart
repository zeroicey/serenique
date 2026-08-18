import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/tag/tag_api.dart';
import 'package:serenique_mobile/features/tag/tag_page.dart';
import 'package:serenique_mobile/features/tag/tag_providers.dart';

/// 内存版 TagApi：写操作同步改本地 items，供管理页交互测试（无网络 IO）。
class _FakeTagApi extends TagApi {
  _FakeTagApi([List<MomentTag>? initial])
    : items = List.of(initial ?? const []),
      super(ApiClient(baseUrl: 'http://localhost', tokenReader: () => null));

  final List<MomentTag> items;
  int _seq = 0;
  String? lastRenamed;
  String? lastDeleted;

  @override
  Future<List<MomentTag>> list() async => List.of(items);

  @override
  Future<MomentTag> create(String name) async {
    _seq++;
    final t = MomentTag(id: 't$_seq', name: name, momentCount: 0);
    items.add(t);
    return t;
  }

  @override
  Future<MomentTag> rename(String id, String name) async {
    lastRenamed = '$id:$name';
    final i = items.indexWhere((t) => t.id == id);
    final t = MomentTag(id: id, name: name, momentCount: items[i].momentCount);
    items[i] = t;
    return t;
  }

  @override
  Future<void> delete(String id) async {
    lastDeleted = id;
    items.removeWhere((t) => t.id == id);
  }
}

void main() {
  testWidgets('标签列表展示名称与使用数', (tester) async {
    final fake = _FakeTagApi([
      const MomentTag(id: 't1', name: '工作', momentCount: 3),
      const MomentTag(id: 't2', name: '生活', momentCount: 0),
    ]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [tagApiProvider.overrideWithValue(fake)],
        child: const MaterialApp(home: Scaffold(body: TagPage())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('工作'), findsOneWidget);
    expect(find.text('3 条闪记'), findsOneWidget);
    expect(find.text('生活'), findsOneWidget);
    expect(find.text('0 条闪记'), findsOneWidget);
  });

  testWidgets('顶部输入创建标签（含 32 字上限与空校验）', (tester) async {
    final fake = _FakeTagApi();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [tagApiProvider.overrideWithValue(fake)],
        child: const MaterialApp(home: Scaffold(body: TagPage())),
      ),
    );
    await tester.pumpAndSettle();

    // 空输入创建 → 提示
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(find.text('请输入标签名'), findsOneWidget);

    // 正常创建
    await tester.enterText(find.byType(TextField).first, '读书');
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    expect(fake.items.map((t) => t.name), contains('读书'));
    expect(find.text('读书'), findsOneWidget);
  });

  testWidgets('重命名标签', (tester) async {
    final fake = _FakeTagApi([
      const MomentTag(id: 't1', name: '工作', momentCount: 3),
    ]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [tagApiProvider.overrideWithValue(fake)],
        child: const MaterialApp(home: Scaffold(body: TagPage())),
      ),
    );
    await tester.pumpAndSettle();

    // 打开行操作菜单 → 重命名
    await tester.tap(find.byIcon(Icons.more_vert).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('重命名'));
    await tester.pumpAndSettle();
    // 对话框内输入新名并保存
    await tester.enterText(find.byType(TextField).last, '工作笔记');
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(fake.lastRenamed, 't1:工作笔记');
    expect(find.text('工作笔记'), findsOneWidget);
  });

  testWidgets('删除标签需确认', (tester) async {
    final fake = _FakeTagApi([
      const MomentTag(id: 't1', name: '工作', momentCount: 3),
    ]);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [tagApiProvider.overrideWithValue(fake)],
        child: const MaterialApp(home: Scaffold(body: TagPage())),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.more_vert).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除').last); // 确认对话框
    await tester.pumpAndSettle();
    expect(fake.lastDeleted, 't1');
    expect(find.text('工作'), findsNothing);
  });

  testWidgets('点击标签 → 设置标签过滤并跳转闪记页', (tester) async {
    final fake = _FakeTagApi([
      const MomentTag(id: 't1', name: '工作', momentCount: 3),
    ]);
    final container = ProviderContainer(
      overrides: [tagApiProvider.overrideWithValue(fake)],
    );
    addTearDown(container.dispose);
    final router = GoRouter(
      initialLocation: '/tags',
      routes: [
        GoRoute(path: '/tags', builder: (c, s) => const TagPage()),
        GoRoute(
          path: '/moments',
          builder: (c, s) => const Scaffold(body: Text('闪记页')),
        ),
      ],
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('工作'));
    await tester.pumpAndSettle();
    // 已跳转到闪记页
    expect(find.text('闪记页'), findsOneWidget);
    // 同时写入标签过滤态
    expect(container.read(momentTagFilterProvider), 't1');
  });
}
