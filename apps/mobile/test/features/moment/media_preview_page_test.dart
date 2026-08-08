import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
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
    await tester.pump();
    expect(barOpacity(tester), 1);
    expect(find.text('1 / 2'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    expect(barOpacity(tester), 0);
  });

  testWidgets('控制条隐藏时页面仍可点按唤出', (tester) async {
    await pumpPreview(tester);
    expect(find.byType(MediaPreviewPage), findsOneWidget);

    await tester.tap(find.byType(PageView));
    await tester.pump();
    expect(barOpacity(tester), 1);
  });

  testWidgets('图片铺满整页：cover 无黑边 + Hero 共享元素过渡', (tester) async {
    await pumpPreview(tester);

    // Hero 共享元素存在（缩略图放大飞入全屏）
    expect(find.byType(Hero), findsOneWidget);

    // 图片盒子 = 全屏（SizedBox.expand；Hero 内部还有一个 null 尺寸的 SizedBox，跳过它）
    final expanded = tester
        .widgetList<SizedBox>(
          find.descendant(
            of: find.byType(InteractiveViewer),
            matching: find.byType(SizedBox),
          ),
        )
        .where((b) => b.width != null);
    expect(expanded, isNotEmpty);
    expect(
      expanded.every((b) => b.width == double.infinity && b.height == double.infinity),
      isTrue,
    );

    // cover 模式：图片铺满屏幕，无黑边
    final image = tester.widget<Image>(find.byType(Image));
    expect(image.fit, BoxFit.cover);
  });
}
