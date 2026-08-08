import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/moment_detail_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';

MomentAttachment att(int i) => MomentAttachment(
      id: 'a$i',
      blobId: 'b$i',
      role: 'attachment',
      sortOrder: i,
      blob: MomentBlob(
        id: 'b$i', originalName: 'p$i.jpg', mimeType: 'image/jpeg',
        size: 1, fileUrl: '/api/blobs/b$i/file', createdAt: 't',
      ),
    );

/// 等待图片解码完成。Flutter 3.44 的 NetworkImage 解码是引擎异步操作，
/// 纯 fake-async 的 pumpAndSettle 下永不完成（CircularProgressIndicator 卡死超时），
/// 需要 runAsync + 真实延时放行事件循环，并交替 pump 驱动 provider 解析与构建。
Future<void> settle(WidgetTester tester) async {
  await tester.runAsync(() async {
    for (var i = 0; i < 8; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      await tester.pump();
    }
  });
  await tester.pumpAndSettle();
}


/// 假写操作：记录 update/delete/deleteComment，不走网络。
class _FakeActions extends MomentActions {
  _FakeActions(super.ref);

  final updated = <String>[];
  final deleted = <String>[];
  final deletedComments = <String>[];

  @override
  Future<Moment> update(String id, String text) async {
    updated.add('$id:$text');
    return Moment(
      id: id,
      text: text,
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
  }

  @override
  Future<void> delete(String id) async {
    deleted.add(id);
  }

  @override
  Future<void> deleteComment(String momentId, String commentId) async {
    deletedComments.add(commentId);
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

  late _FakeActions fake;

  /// 详情页 + Provider 覆写；带 router 时用 GoRouter 包一层以便验证 pop。
  Widget buildApp({required bool withRouter}) {
    final overrides = [
      momentDetailProvider(moment.id).overrideWith((ref) async => moment),
      momentActionsProvider.overrideWith((ref) => fake = _FakeActions(ref)),
    ];
    final page = MomentDetailPage(id: moment.id);
    if (!withRouter) {
      return ProviderScope(
        overrides: overrides,
        child: MaterialApp(home: page),
      );
    }
    return ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(
        routerConfig: GoRouter(
          initialLocation: '/home',
          routes: [
            GoRoute(
              path: '/home',
              builder: (_, _) =>
                  const Scaffold(body: Center(child: Text('列表页'))),
            ),
            GoRoute(path: '/detail', builder: (_, _) => page),
          ],
        ),
      ),
    );
  }

  /// 带 router 时从 /home push 进详情页——pop 才有地方回。
  Future<void> pumpDetail(WidgetTester tester,
      {required bool withRouter}) async {
    await tester.pumpWidget(buildApp(withRouter: withRouter));
    if (withRouter) {
      GoRouter.of(tester.element(find.text('列表页'))).push('/detail');
    }
    await tester.pumpAndSettle();
    // 强制初始化 fake（momentActionsProvider 只在写操作时被 read）。
    ProviderScope.containerOf(tester.element(find.byType(MomentDetailPage)))
        .read(momentActionsProvider);
  }

  testWidgets('详情页显示文本与评论，正文可直接编辑', (tester) async {
    await pumpDetail(tester, withRouter: false);
    expect(find.text('今天的闪记'), findsOneWidget);
    // 评论文字嵌在 Text.rich（WidgetSpan 头像）里，toPlainText 开头含 U+FFFC，用包含匹配。
    expect(find.textContaining('第一条评论', findRichText: true), findsOneWidget);
    // 页面上有两个 TextField：正文（可编辑）+ 评论区输入框。
    expect(find.byType(TextField), findsNWidgets(2));
    expect(find.byIcon(Icons.delete_outline), findsOneWidget); // 删除在右上角标题栏
    expect(find.byIcon(Icons.check), findsOneWidget); // 保存在右上角
    expect(find.byType(FloatingActionButton), findsNothing); // 不在右下角 FAB
  });

  testWidgets('编辑正文 → 点保存 → update 被调用并返回列表页', (tester) async {
    await pumpDetail(tester, withRouter: true);

    await tester.enterText(find.byType(TextField).first, '改过的内容');
    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();

    expect(fake.updated, ['m1:改过的内容']);
    expect(find.text('列表页'), findsOneWidget); // 保存成功后返回
  });

  testWidgets('保存空内容被拦截，不调用 update', (tester) async {
    await pumpDetail(tester, withRouter: false);

    await tester.enterText(find.byType(TextField).first, '   ');
    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();

    expect(fake.updated, isEmpty);
    expect(find.text('内容不能为空'), findsOneWidget);
  });

  testWidgets('删除闪记 → 确认 → delete 被调用并返回', (tester) async {
    await pumpDetail(tester, withRouter: true);

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    expect(find.text('删除这条闪记？'), findsOneWidget);

    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();

    expect(fake.deleted, ['m1']);
    expect(find.text('列表页'), findsOneWidget); // 删除成功后返回
  });

  testWidgets('长按评论 → 底部弹层 → 删除评论', (tester) async {
    await pumpDetail(tester, withRouter: false);

    // 长按评论 → 底部弹层（删除 / 取消）
    await tester.longPress(find.textContaining('第一条评论', findRichText: true));
    await tester.pumpAndSettle();
    expect(find.text('删除这条评论？'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);
    expect(find.text('取消'), findsNothing); // 点空白处自动取消，不设取消按钮

    // 点删除 → deleteComment 被调用
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();
    expect(fake.deletedComments, ['c1']);
  });

  testWidgets('曲面屏安全距离：评论输入框不贴屏幕底边', (tester) async {
    // viewPadding 是物理像素，dpr=3 时逻辑 34 = 物理 102。
    tester.view.viewPadding = const FakeViewPadding(bottom: 102);
    addTearDown(tester.view.reset);
    await pumpDetail(tester, withRouter: false);

    // 发送按钮底部必须在手势条（逻辑 34）之上，不能贴住屏幕底边（逻辑 600）。
    final rect = tester.getRect(find.byTooltip('发送'));
    expect(rect.bottom, lessThanOrEqualTo(600 - 34));
  });

  testWidgets('键盘弹起时评论输入条跟随上移，不被输入法遮挡', (tester) async {
    // viewInsets 是物理像素，dpr=3 时逻辑 300 = 物理 900。
    tester.view.viewInsets = const FakeViewPadding(bottom: 900);
    addTearDown(tester.view.reset);
    await pumpDetail(tester, withRouter: false);

    // 输入条底部必须位于键盘（逻辑 y=300）之上。
    final rect = tester.getRect(find.byTooltip('发送'));
    expect(rect.bottom, lessThanOrEqualTo(300));
  });

  // 附件网格：详情页正文下方显示并可打开预览
  testWidgets('详情页正文下方显示附件网格，点瓦片打开预览', (tester) async {
    await mockNetworkImages(() async {
      final withAtt = Moment(
        id: 'm1', text: '看图', attachments: [att(0), att(1)],
        comments: const [], commentCount: 0, createdAt: 't', updatedAt: 't',
      );
      await tester.pumpWidget(ProviderScope(
        overrides: [
          momentDetailProvider.overrideWith((ref, id) async => withAtt),
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(home: MomentDetailPage(id: 'm1')),
      ));
      await settle(tester);
      expect(find.byType(AttachmentGrid), findsOneWidget);
      expect(find.byType(Image), findsNWidgets(2));
      await tester.tap(find.byType(Image).first);
      await settle(tester);
      expect(find.text('1 / 2'), findsOneWidget);
    });
  });
}
