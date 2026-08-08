import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/widgets/local_attachment_grid.dart';

PickedAttachment img(int i) => PickedAttachment(
      bytes: Uint8List.fromList([1, 2, 3]), filename: 'p$i.jpg',
      mimeType: 'image/jpeg', localPath: '/tmp/p$i.jpg');

void main() {
  testWidgets('渲染附件瓦片：图片/视频/音频区分 + 「+」瓦片', (tester) async {
    final list = [
      img(0),
      PickedAttachment(bytes: Uint8List.fromList([1]), filename: 'v.mp4', mimeType: 'video/mp4', durationMs: 150000),
      PickedAttachment(bytes: Uint8List.fromList([1]), filename: 'a.mp3', mimeType: 'audio/mpeg'),
    ];
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: LocalAttachmentGrid(attachments: list, onRemove: (_) {}, onAdd: () {}))));
    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.byIcon(Icons.play_circle_outline), findsOneWidget);
    expect(find.text('a.mp3'), findsOneWidget);
    expect(find.byIcon(Icons.audio_file), findsOneWidget);
  });

  testWidgets('点 ✕ 触发 onRemove 且携带正确 index；点「+」触发 onAdd', (tester) async {
    final removed = <int>[];
    var added = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: LocalAttachmentGrid(
      attachments: [img(0), img(1)],
      onRemove: removed.add, onAdd: () => added++,
    ))));
    await tester.tap(find.byIcon(Icons.close).first);
    expect(removed, [0]);
    await tester.tap(find.byIcon(Icons.add));
    expect(added, 1);
  });
}
