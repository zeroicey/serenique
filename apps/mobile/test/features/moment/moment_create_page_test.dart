import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:serenique_mobile/core/network/api_client.dart';
import 'package:serenique_mobile/core/network/api_exception.dart';
import 'package:serenique_mobile/features/moment/moment_api.dart';
import 'package:serenique_mobile/features/moment/moment_create_page.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';
import 'package:serenique_mobile/features/moment/moment_providers.dart';
import 'package:serenique_mobile/features/moment/widgets/local_attachment_grid.dart';

/// 假 MomentApi：记录 uploadBlob 调用与 create 收到的附件；
/// 配置 uploadError 后 uploadBlob 抛错（模拟上传失败）。
class _FakeMomentApi extends MomentApi {
  _FakeMomentApi({this.uploadError})
      : super(ApiClient(baseUrl: 'http://localhost', sessionReader: () => null));

  final Object? uploadError;
  int uploadCount = 0;
  String? createText;
  List<MomentAttachmentInput>? createAttachments;

  @override
  Future<MomentBlob> uploadBlob(Uint8List bytes,
      {required String filename, required String mimeType}) async {
    uploadCount++;
    final err = uploadError;
    if (err != null) throw err;
    return MomentBlob(
      id: 'blob-$uploadCount',
      originalName: filename,
      mimeType: mimeType,
      size: bytes.length,
      fileUrl: '',
      createdAt: '',
    );
  }

  @override
  Future<Moment> create(String text,
      {List<MomentAttachmentInput> attachments = const []}) async {
    createText = text;
    createAttachments = attachments;
    return Moment(
      id: 'm1',
      text: text,
      comments: const [],
      commentCount: 0,
      createdAt: '',
      updatedAt: '',
    );
  }
}

void main() {
  Future<void> pumpCreate(WidgetTester tester,
      {List<PickedAttachment>? initial, _FakeMomentApi? api}) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        momentListProvider.overrideWith((ref) async => []),
        if (initial != null)
          pickedAttachmentsProvider
              .overrideWith(() => PickedAttachments(initial: initial)),
        if (api != null) ...[
          momentApiProvider.overrideWithValue(api),
          pickedAttachmentsProvider.overrideWith(PickedAttachments.new),
        ],
      ],
      child: MaterialApp.router(
        routerConfig: GoRouter(
          initialLocation: '/moments/create',
          routes: [
            GoRoute(
              path: '/moments',
              builder: (_, _) => const Scaffold(body: SizedBox()),
              routes: [
                GoRoute(
                  path: 'create',
                  builder: (_, _) => const MomentCreatePage(),
                ),
              ],
            ),
          ],
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  /// 通过 ProviderContainer 写入已选附件（模拟选择完图片的状态）。
  ProviderContainer presetAttachments(WidgetTester tester,
      List<PickedAttachment> attachments) {
    final container =
        ProviderScope.containerOf(tester.element(find.byType(MomentCreatePage)));
    container
        .read(pickedAttachmentsProvider.notifier)
        .set(attachments);
    return container;
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

  testWidgets('发表带附件：逐个上传后创建并清空已选', (tester) async {
    final api = _FakeMomentApi();
    await pumpCreate(tester, api: api);
    final container = presetAttachments(tester, [
      PickedAttachment(
          bytes: Uint8List.fromList([1]),
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          localPath: '/tmp/a.jpg'),
      PickedAttachment(
          bytes: Uint8List.fromList([2]),
          filename: 'b.png',
          mimeType: 'image/png',
          localPath: '/tmp/b.png'),
    ]);
    await tester.pump();

    await tester.enterText(find.byType(TextField).first, '看图');
    await tester.tap(find.text('发表'));
    await tester.pumpAndSettle();

    expect(api.uploadCount, 2);
    expect(api.createText, '看图');
    expect(api.createAttachments, hasLength(2));
    expect(api.createAttachments!.map((a) => a.blobId).toList(),
        ['blob-1', 'blob-2']);
    expect(container.read(pickedAttachmentsProvider), isEmpty);
  });

  testWidgets('上传失败：提示并保留附件，页面不关闭', (tester) async {
    final api =
        _FakeMomentApi(uploadError: const ApiException('UPLOAD_FAILED', '上传失败'));
    await pumpCreate(tester, api: api);
    final container = presetAttachments(tester, [
      PickedAttachment(
          bytes: Uint8List.fromList([1]),
          filename: 'a.jpg',
          mimeType: 'image/jpeg',
          localPath: '/tmp/a.jpg'),
    ]);
    await tester.pump();

    await tester.enterText(find.byType(TextField).first, '看图');
    await tester.tap(find.text('发表'));
    await tester.pumpAndSettle();

    expect(find.text('上传失败'), findsOneWidget); // snackbar 出现
    expect(container.read(pickedAttachmentsProvider), hasLength(1)); // 附件保留
    expect(find.byType(MomentCreatePage), findsOneWidget); // 页面未 pop
    expect(find.byType(LocalAttachmentGrid), findsOneWidget);
  });
}
