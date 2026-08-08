import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/media_preview_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';

MomentAttachment attachment({
  required String id,
  required String mimeType,
  String? name,
}) =>
    MomentAttachment(
      id: id,
      blobId: 'blob-$id',
      role: 'attachment',
      displayName: name,
      sortOrder: 0,
      blob: MomentBlob(
        id: 'blob-$id',
        originalName: name ?? '$id.bin',
        mimeType: mimeType,
        size: 1,
        fileUrl: '/api/blobs/blob-$id/file',
        createdAt: 't',
      ),
    );

Future<void> pumpGrid(WidgetTester tester, List<MomentAttachment> attachments) {
  return mockNetworkImages(() async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        blobAccessUrlProvider.overrideWith((ref, blobId) async => 'http://media.test/$blobId'),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: AttachmentGrid(attachments: attachments),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
  });
}

void main() {
  testWidgets('图片瓦片渲染 Image', (tester) async {
    await pumpGrid(tester, [attachment(id: 'a1', mimeType: 'image/jpeg', name: 'x.jpg')]);
    expect(find.byType(Image), findsOneWidget);
  });

  testWidgets('视频瓦片显示播放图标', (tester) async {
    await pumpGrid(tester, [attachment(id: 'a1', mimeType: 'video/mp4', name: 'x.mp4')]);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
  });

  testWidgets('音频瓦片显示音乐图标与文件名', (tester) async {
    await pumpGrid(tester, [attachment(id: 'a1', mimeType: 'audio/mpeg', name: 'x.mp3')]);
    expect(find.byIcon(Icons.music_note), findsOneWidget);
  });

  testWidgets('超过 9 个附件折叠显示「+N 更多」，点击展开', (tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final many = List.generate(11, (i) => attachment(id: 'a$i', mimeType: 'image/jpeg'));
    await pumpGrid(tester, many);
    expect(find.text('+3 更多'), findsOneWidget);
    expect(find.byType(Image), findsNWidgets(8));

    await tester.tap(find.text('+3 更多'));
    await tester.pumpAndSettle();
    expect(find.text('+3 更多'), findsNothing);
    expect(find.byType(Image), findsNWidgets(11));
  });

  testWidgets('点击图片瓦片进入全屏预览，关闭后返回网格', (tester) async {
    await pumpGrid(tester, [
      attachment(id: 'a1', mimeType: 'image/jpeg', name: 'x.jpg'),
      attachment(id: 'a2', mimeType: 'image/jpeg', name: 'y.jpg'),
    ]);
    await tester.tap(find.byType(Image).first);
    await tester.pumpAndSettle();

    // 预览页打开，控制条默认隐藏（全屏沉浸）
    expect(find.byType(MediaPreviewPage), findsOneWidget);
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );

    // 点击页面唤出控制条 → 点关闭返回
    await tester.tap(find.byType(PageView));
    await tester.pump();
    expect(find.text('1 / 2'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    // 已返回网格：预览页与计数消失。
    expect(find.byType(MediaPreviewPage), findsNothing);
    expect(find.text('1 / 2'), findsNothing);
  });
}
