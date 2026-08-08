import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/media_preview.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';

MomentAttachment att(int i, {String mime = 'image/jpeg'}) => MomentAttachment(
      id: 'a$i',
      blobId: 'b$i',
      role: 'attachment',
      sortOrder: i,
      blob: MomentBlob(
        id: 'b$i',
        originalName: 'p$i.jpg',
        mimeType: mime,
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
  Future<void> open(WidgetTester tester, List<MomentAttachment> list, {int index = 0}) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
        ],
        child: MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showMediaPreview(context,
                      attachments: list, initialIndex: index),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await settle(tester);
    });
  }

  testWidgets('打开后显示 1/N 计数与图片', (tester) async {
    await open(tester, [att(0), att(1), att(2)]);
    expect(find.text('1 / 3'), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
  });

  testWidgets('从指定 index 打开，计数正确', (tester) async {
    await open(tester, [att(0), att(1), att(2)], index: 2);
    expect(find.text('3 / 3'), findsOneWidget);
  });

  testWidgets('左右滑动切换并更新计数', (tester) async {
    await open(tester, [att(0), att(1), att(2)]);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await settle(tester);
    expect(find.text('2 / 3'), findsOneWidget);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await settle(tester);
    expect(find.text('3 / 3'), findsOneWidget);
  });

  testWidgets('点图片关闭遮罩（单击需等双击判定超时）', (tester) async {
    await open(tester, [att(0)]);
    expect(find.text('1 / 1'), findsOneWidget);
    await tester.tap(find.byType(InteractiveViewer));
    // onTap 与 onDoubleTap 并存：单击要等双击判定窗口（约 350ms）才触发关闭。
    await tester.pump(const Duration(milliseconds: 400));
    await settle(tester);
    expect(find.text('1 / 1'), findsNothing);
  });

  testWidgets('双击图片放大，再双击缩回', (tester) async {
    await open(tester, [att(0)]);
    // 双击放大：缩放比例变为 2.5
    await tester.tap(find.byType(InteractiveViewer));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byType(InteractiveViewer));
    await tester.pumpAndSettle();
    final zoomed = tester
        .widget<InteractiveViewer>(find.byType(InteractiveViewer))
        .transformationController!
        .value;
    expect(zoomed.getMaxScaleOnAxis(), closeTo(2.5, 0.01));
    // 预览未关闭（双击不触发关闭）
    expect(find.text('1 / 1'), findsOneWidget);
    // 再双击缩回 1.0
    await tester.tap(find.byType(InteractiveViewer));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.byType(InteractiveViewer));
    await tester.pumpAndSettle();
    final reset = tester
        .widget<InteractiveViewer>(find.byType(InteractiveViewer))
        .transformationController!
        .value;
    expect(reset.getMaxScaleOnAxis(), closeTo(1.0, 0.01));
  });

  testWidgets('视频/音频页显示占位（▶ + 时长 / 图标 + 文件名）', (tester) async {
    final video = MomentAttachment(
      id: 'v', blobId: 'bv', role: 'attachment', sortOrder: 0,
      blob: MomentBlob(id: 'bv', originalName: 'v.mp4', mimeType: 'video/mp4',
          size: 1, duration: 150000, fileUrl: '/f', createdAt: 't'),
    );
    final audio = MomentAttachment(
      id: 'au', blobId: 'ba', role: 'attachment', sortOrder: 1,
      blob: MomentBlob(id: 'ba', originalName: 'a.mp3', mimeType: 'audio/mpeg',
          size: 1, fileUrl: '/f', createdAt: 't'),
    );
    await open(tester, [video, audio]);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
    expect(find.text('02:30'), findsOneWidget);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await settle(tester);
    expect(find.byIcon(Icons.audio_file), findsOneWidget);
    expect(find.text('a.mp3'), findsOneWidget);
  });
}
