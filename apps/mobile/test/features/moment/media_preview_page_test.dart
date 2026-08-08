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
  testWidgets('预览页初始显示控制条，2.5 秒后自动隐藏', (tester) async {
    await pumpPreview(tester);
    expect(find.text('1 / 2'), findsOneWidget);
    expect(barOpacity(tester), 1);

    await tester.pump(const Duration(seconds: 3));
    expect(barOpacity(tester), 0);
  });

  testWidgets('隐藏后点击页面重新显示控制条', (tester) async {
    await pumpPreview(tester);
    await tester.pump(const Duration(seconds: 3));
    expect(barOpacity(tester), 0);

    await tester.tap(find.byType(PageView));
    await tester.pump();
    expect(barOpacity(tester), 1);
    expect(find.text('1 / 2'), findsOneWidget);
  });

  testWidgets('图片铺满整页（InteractiveViewer 子组件为全屏盒子）', (tester) async {
    await pumpPreview(tester);
    final box = tester.widget<SizedBox>(
      find.descendant(
        of: find.byType(InteractiveViewer),
        matching: find.byType(SizedBox),
      ),
    );
    expect(box, isNotNull);
    // SizedBox.expand：图片盒子 = 视口大小，contain 按整屏计算
    expect(box.width, double.infinity);
    expect(box.height, double.infinity);
  });
}
