import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail_image_network/mocktail_image_network.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_grid.dart';

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

Widget wrap(Widget child) => ProviderScope(
      overrides: [
        blobAccessUrlProvider.overrideWith((ref, blobId) async => 'https://img.test/$blobId'),
      ],
      child: MaterialApp(home: Scaffold(body: child)),
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
  testWidgets('1 张图渲染 1 个瓦片', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: [att(0)], onTapTile: (_) {})));
      await settle(tester);
      expect(find.byType(Image), findsOneWidget);
    });
  });

  testWidgets('>9 张折叠：前 8 张 + 「+6 更多」瓦片', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(14, att), onTapTile: (_) {})));
      await settle(tester);
      expect(find.byType(Image), findsNWidgets(8));
      expect(find.text('+6 更多'), findsOneWidget);
    });
  });

  testWidgets('点「更多」就地展开显示全部', (tester) async {
    // 默认测试视口 800x600：折叠态第 3 行与展开后的第 10 个瓦片在视口外，
    // shrink-wrap 网格不预建视口外瓦片，tap 也会落空。加高视口让 10 个瓦片全部可见。
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(10, att), onTapTile: (_) {})));
      await settle(tester);
      await tester.tap(find.text('+2 更多'));
      await settle(tester);
      expect(find.byType(Image), findsNWidgets(10));
      expect(find.text('+2 更多'), findsNothing);
    });
  });

  testWidgets('≤9 张不折叠', (tester) async {
    await mockNetworkImages(() async {
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(9, att), onTapTile: (_) {})));
      await settle(tester);
      expect(find.byType(Image), findsNWidgets(9));
      expect(find.textContaining('更多'), findsNothing);
    });
  });

  testWidgets('点击瓦片回调携带正确 index', (tester) async {
    await mockNetworkImages(() async {
      final tapped = <int>[];
      await tester.pumpWidget(wrap(AttachmentGrid(attachments: List.generate(4, att), onTapTile: tapped.add)));
      await settle(tester);
      await tester.tap(find.byType(Image).at(2));
      expect(tapped, [2]);
    });
  });

  testWidgets('视频瓦片：▶ + 时长 mm:ss；音频瓦片：图标 + 文件名', (tester) async {
    await mockNetworkImages(() async {
      final video = att(0, mime: 'video/mp4');
      final audio = att(1, mime: 'audio/mpeg');
      await tester.pumpWidget(wrap(AttachmentGrid(
        attachments: [video, audio],
        onTapTile: (_) {},
      )));
      await settle(tester);
      expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
      expect(find.text('00:00'), findsOneWidget); // duration 为空显示 00:00
      expect(find.byIcon(Icons.audio_file), findsOneWidget);
      expect(find.text('p1.jpg'), findsOneWidget); // audio 瓦片显示文件名
    });
  });

  test('formatDurationMs 补零与进位', () {
    expect(formatDurationMs(60000), '01:00'); // 60s 整分钟补零
    expect(formatDurationMs(3661000), '1:01:01'); // 1h1m1s 进位
  });

  test('sortedAttachments 按 (sortOrder, createdAt, id) 排序且不改原列表', () {
    MomentAttachment mk(String id, int sortOrder, String createdAt) =>
        MomentAttachment(
          id: id,
          blobId: id,
          role: 'attachment',
          sortOrder: sortOrder,
          createdAt: createdAt,
          blob: MomentBlob(
            id: id,
            originalName: '$id.jpg',
            mimeType: 'image/jpeg',
            size: 1,
            fileUrl: '/api/blobs/$id/file',
            createdAt: 't',
          ),
        );
    final input = [
      mk('c', 0, 't3'),
      mk('a', 0, 't1'),
      mk('b', 0, 't1'),
      mk('e', 1, 't5'),
      mk('d', 2, 't9'),
    ];
    final sorted = sortedAttachments(input);
    expect(sorted.map((a) => a.id).toList(), ['a', 'b', 'c', 'e', 'd']);
    expect(input.map((a) => a.id).toList(), ['c', 'a', 'b', 'e', 'd']); // 未改原列表
  });

  testWidgets('折叠态点击第 4 瓦片回调 index=3', (tester) async {
    // 加高视口让折叠态 3 行瓦片全部可见（参考上方 >9 测试）。
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await mockNetworkImages(() async {
      final tapped = <int>[];
      await tester.pumpWidget(wrap(AttachmentGrid(
          attachments: List.generate(12, att), onTapTile: tapped.add)));
      await settle(tester);
      expect(find.byType(Image), findsNWidgets(8)); // 确认折叠态
      await tester.tap(find.byType(Image).at(3));
      expect(tapped, [3]);
    });
  });
}
