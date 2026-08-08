import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:photo_view_plus/photo_view_plus.dart';
import 'package:photo_view_plus/photo_view_plus_gallery.dart';
import 'package:serenique_mobile/features/moment/media_preview_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

MomentAttachment imageAttachment(String id) => MomentAttachment(
      id: id,
      blobId: 'blob-$id',
      role: 'attachment',
      sortOrder: 0,
      blob: MomentBlob(
        id: 'blob-$id',
        originalName: '$id.jpg',
        mimeType: 'image/jpeg',
        size: 1,
        fileUrl: '/api/blobs/blob-$id/file',
        createdAt: 't',
      ),
    );

Future<void> pumpPreview(WidgetTester tester) {
  return mockNetworkImages(() async {
    // runAsync：让真实异步（图片解码）完成——fake 时钟下解码永远不结束，
    // PhotoView 的 loadingBuilder spinner 会一直转导致 pumpAndSettle 超时。
    await tester.runAsync(() async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith(
              (ref, blobId) async => 'http://media.test/$blobId'),
        ],
        child: MaterialApp(
          home: MediaPreviewPage(
            attachments: [imageAttachment('a1'), imageAttachment('a2')],
            initialIndex: 0,
          ),
        ),
      ));
      await tester.pump();
      await Future<void>.delayed(const Duration(milliseconds: 300));
      await tester.pump();
    });
    await tester.pumpAndSettle();
  });
}

/// 顶部控制条（关闭 + 计数）的透明度目标值。
double barOpacity(WidgetTester tester) =>
    tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity;

void main() {
  testWidgets('预览页初始隐藏控制条（全屏沉浸），点击唤出后 2.5 秒自动隐藏', (tester) async {
    await pumpPreview(tester);
    expect(barOpacity(tester), 0);

    await tester.tap(find.byType(PageView));
    // PhotoView 的 DoubleTap 识别器让竞技场保持 300ms，需推进假时钟才能收到 tap 回调
    await tester.pump(const Duration(milliseconds: 350));
    expect(barOpacity(tester), 1);
    expect(find.text('1 / 2'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    expect(barOpacity(tester), 0);
  });

  testWidgets('控制条隐藏时页面仍可点按唤出', (tester) async {
    await pumpPreview(tester);
    expect(find.byType(MediaPreviewPage), findsOneWidget);

    await tester.tap(find.byType(PageView));
    // PhotoView 的 DoubleTap 识别器让竞技场保持 300ms，需推进假时钟才能收到 tap 回调
    await tester.pump(const Duration(milliseconds: 350));
    expect(barOpacity(tester), 1);
  });

  testWidgets('图片页基于 PhotoViewGallery：covered 铺满 + Hero 共享元素过渡', (tester) async {
    await pumpPreview(tester);

    final gallery =
        tester.widget<PhotoViewGallery>(find.byType(PhotoViewGallery));
    final page = gallery.pageOptions!.first;
    // Hero 过渡：tag 与网格缩略图一致（blob-a1 的 blobId 是 'blob-a1'）
    expect(page.heroAttributes?.tag, 'blob-blob-a1');
    // covered：初始铺满全屏无黑边；可捏合缩回 contained 看全图
    expect(page.initialScale, PhotoViewScale.covered);
    expect(page.minScale, PhotoViewScale.contained);
    // 图库内有 Hero 元素（飞入过渡由 photo_view 提供）
    expect(find.byType(Hero), findsOneWidget);
  });
}
