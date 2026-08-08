import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_create_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/local_attachment_grid.dart';

void main() {
  Future<void> pumpCreate(WidgetTester tester,
      {List<PickedAttachment>? initial}) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentListProvider.overrideWith((ref) async => []),
        if (initial != null)
          pickedAttachmentsProvider
              .overrideWith(() => PickedAttachments(initial: initial)),
      ],
      child: const MaterialApp(home: MomentCreatePage()),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('空文字发表被拦截', (tester) async {
    await pumpCreate(tester);
    await tester.tap(find.text('发表'));
    await tester.pump();
    expect(find.text('内容不能为空'), findsOneWidget);
  });

  testWidgets('有附件时显示本地网格', (tester) async {
    await pumpCreate(tester, initial: [
      PickedAttachment(
          bytes: Uint8List.fromList([1]),
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          localPath: '/tmp/a.jpg'),
    ]);
    expect(find.byType(LocalAttachmentGrid), findsOneWidget);
    expect(find.text('a.jpg'), findsNothing); // 图片瓦片不显示文件名
  });
}
