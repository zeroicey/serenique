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
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(home: Scaffold(body: MomentCard(moment: momentWithAttachments()))),
      ));
      await settle(tester);
      expect(find.text('看照片'), findsOneWidget);
      expect(find.byType(AttachmentGrid), findsOneWidget);
      expect(find.byType(Image), findsNWidgets(2));
    });
  });

  testWidgets('点卡片瓦片打开全屏预览遮罩', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(home: Scaffold(body: MomentCard(moment: momentWithAttachments()))),
      ));
      await settle(tester);
      await tester.tap(find.byType(Image).first);
      await settle(tester);
      expect(find.text('1 / 2'), findsOneWidget); // 预览遮罩出现
      expect(find.byType(InteractiveViewer), findsOneWidget);
    });
  });
}
