import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';
import 'package:serenique_mobile/features/moment/widgets/moment_card.dart';

MomentAttachment att(int i) => MomentAttachment(
  id: 'a$i',
  blobId: 'b$i',
  role: 'attachment',
  sortOrder: i,
  blob: MomentBlob(
    id: 'b$i',
    originalName: 'p$i.jpg',
    mimeType: 'image/jpeg',
    size: 1,
    fileUrl: '/api/blobs/b$i/file',
    createdAt: 't',
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

void main() {
  Moment momentWithAttachments() => Moment(
    id: 'm1',
    text: '看照片',
    attachments: [att(0), att(1)],
    comments: const [],
    commentCount: 0,
    createdAt: 't',
    updatedAt: 't',
  );

  testWidgets('卡片正文下方显示附件网格', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            blobAccessUrlProvider.overrideWith(
              (ref, blobId) async => 'https://img.test/$blobId',
            ),
          ],
          child: MaterialApp(
            home: Scaffold(body: MomentCard(moment: momentWithAttachments())),
          ),
        ),
      );
      await settle(tester);
      expect(find.text('看照片'), findsOneWidget);
      expect(find.byType(AttachmentGrid), findsOneWidget);
      expect(find.byType(Image), findsNWidgets(2));
    });
  });

  testWidgets('卡片展示标签 chips，点击触发 onTagTap', (tester) async {
    final m = Moment(
      id: 'm5',
      text: '带标签的闪记',
      tags: const [MomentTag(id: 't1', name: '工作', momentCount: 2)],
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    MomentTag? tapped;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MomentCard(moment: m, onTagTap: (t) => tapped = t),
        ),
      ),
    );
    expect(find.text('#工作'), findsOneWidget);
    await tester.tap(find.text('#工作'));
    expect(tapped?.id, 't1');
  });

  testWidgets('onTagTap 为空时不渲染可点（仍展示标签）', (tester) async {
    final m = Moment(
      id: 'm6',
      text: '带标签',
      tags: const [MomentTag(id: 't1', name: '工作', momentCount: 2)],
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: MomentCard(moment: m)),
      ),
    );
    expect(find.text('#工作'), findsOneWidget);
  });

  testWidgets('点卡片瓦片打开全屏预览遮罩', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            blobAccessUrlProvider.overrideWith(
              (ref, blobId) async => 'https://img.test/$blobId',
            ),
          ],
          child: MaterialApp(
            home: Scaffold(body: MomentCard(moment: momentWithAttachments())),
          ),
        ),
      );
      await settle(tester);
      await tester.tap(find.byType(Image).first);
      await settle(tester);
      expect(find.text('1 / 2'), findsOneWidget); // 预览遮罩出现
      expect(find.byType(InteractiveViewer), findsOneWidget);
    });
  });

  testWidgets('有 location 时显示位置行（name 优先，对齐 event_tile 样式）', (tester) async {
    final m = Moment(
      id: 'm3',
      text: '带位置',
      location: const MomentLocation(
        name: '星巴克',
        latitude: 39.9827,
        longitude: 116.3162,
      ),
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: MomentCard(moment: m)),
      ),
    );
    expect(find.text('星巴克'), findsOneWidget);
    expect(find.byIcon(Icons.place_outlined), findsOneWidget);
    expect(find.byIcon(Icons.more_horiz), findsOneWidget); // 时间行仍渲染
  });

  testWidgets('无 name 时位置行显示坐标；无 location 时不渲染位置行', (tester) async {
    final withCoords = Moment(
      id: 'm4',
      text: '只有坐标',
      location: const MomentLocation(latitude: 39.90871, longitude: 116.3975),
      comments: const [],
      commentCount: 0,
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: MomentCard(moment: withCoords)),
      ),
    );
    expect(find.text('39.9087, 116.3975'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MomentCard(
            moment: const Moment(
              id: 'm5',
              text: '无位置',
              comments: [],
              commentCount: 0,
              createdAt: 't',
              updatedAt: 't',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.byIcon(Icons.place_outlined), findsNothing);
  });
}
