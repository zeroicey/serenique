import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/widgets/attachment_picker_sheet.dart';

void main() {
  testWidgets('弹层渲染四个选项', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => Center(
            child: ElevatedButton(
              onPressed: () => showAttachmentPickerSheet(ctx),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('拍摄'), findsOneWidget);
    expect(find.text('选文件'), findsOneWidget);
    expect(find.text('从手机相册选择'), findsOneWidget);
    expect(find.text('取消'), findsOneWidget);
  });

  testWidgets('点取消关闭弹层且返回 null（不触发真实 picker）', (tester) async {
    List<PickedAttachment>? result;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => Center(
            child: ElevatedButton(
              onPressed: () async {
                result = await showAttachmentPickerSheet(ctx);
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(find.text('拍摄'), findsNothing);
  });
}
