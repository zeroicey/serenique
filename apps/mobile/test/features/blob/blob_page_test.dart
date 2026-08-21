import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/blob/blob_models.dart';
import 'package:serenique_mobile/features/blob/blob_page.dart';
import 'package:serenique_mobile/features/blob/blob_providers.dart';

/// 素材库页 widget 测试：网格渲染 / 空态 / 删除弹窗引用分支。
/// 网络依赖全部 override（列表 provider、签名直链 provider、引用 provider、
/// 删除 action provider），不发起真实请求。
void main() {
  final image = BlobEntry(
    id: 'b1',
    originalName: 'a.png',
    mimeType: 'image/png',
    size: 1024,
    createdAt: '2026-08-05T00:00:00.000Z',
    refCount: 0,
  );
  final usedImage = BlobEntry(
    id: 'b2',
    originalName: 'used.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    createdAt: '2026-08-05T00:00:00.000Z',
    refCount: 2,
  );
  final pdf = BlobEntry(
    id: 'b3',
    originalName: 'notes.pdf',
    mimeType: 'application/pdf',
    size: 4096,
    createdAt: '2026-08-05T00:00:00.000Z',
  );

  Widget buildPage({
    required BlobPage page,
    List<BlobAttachment>? refs,
  }) {
    return ProviderScope(
      overrides: [
        blobListProvider.overrideWith(() => FakeBlobListNotifier(page)),
        blobAccessUrlProvider.overrideWith((ref, id) async => 'http://x/$id'),
        if (refs != null)
          blobAttachmentsProvider.overrideWith((ref, id) async => refs),
      ],
      child: const MaterialApp(home: BlobLibraryPage()),
    );
  }

  testWidgets('渲染网格：图片与非图片卡片、在用徽标、空 graph', (tester) async {
    await tester.pumpWidget(
      buildPage(page: BlobPage(items: [image, usedImage, pdf], total: 3)),
    );
    await tester.pumpAndSettle();

    // 非图片卡片显示文件名与 mime 后缀
    expect(find.text('notes.pdf'), findsOneWidget);
    expect(find.textContaining('pdf'), findsWidgets);
    // 在用徽标（refCount>0）
    expect(find.text('在用 · 2'), findsOneWidget);
    // 删除按钮：每张卡片一个
    expect(find.byIcon(Icons.delete_outline), findsNWidgets(3));
  });

  testWidgets('空列表显示空态文案', (tester) async {
    await tester.pumpWidget(
      buildPage(page: const BlobPage(items: [], total: 0)),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('暂无文件'), findsOneWidget);
  });

  testWidgets('类型筛选：点击「图片」写入 image/ 前缀', (tester) async {
    await tester.pumpWidget(
      buildPage(page: BlobPage(items: [image], total: 1)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('图片'));
    await tester.pumpAndSettle();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(BlobLibraryPage)),
    );
    expect(container.read(blobFilterProvider), 'image/');
  });

  testWidgets('删除弹窗：被引用时禁删并列出引用方', (tester) async {
    await tester.pumpWidget(
      buildPage(
        page: BlobPage(items: [usedImage], total: 1),
        refs: const [
          BlobAttachment(
            id: 'a1',
            blobId: 'b2',
            ownerType: 'moment',
            ownerId: 'm1',
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    expect(find.textContaining('无法删除'), findsOneWidget);
    expect(find.text('闪记 × 1'), findsOneWidget);
    final confirm = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, '确认删除'),
    );
    expect(confirm.onPressed, isNull); // 禁删
  });

  testWidgets('删除弹窗：无引用时可确认删除（点确认关闭并提示）', (tester) async {
    // 删除 action 用 fake：不真正请求网络
    var deleted = false;
    final overlay = ProviderContainer();
    addTearDown(overlay.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          blobListProvider.overrideWith(
            () => FakeBlobListNotifier(BlobPage(items: [image], total: 1)),
          ),
          blobAccessUrlProvider.overrideWith((ref, id) async => 'http://x/$id'),
          blobAttachmentsProvider.overrideWith((ref, id) async => const []),
          blobActionsProvider.overrideWith(
            (ref) => _FakeBlobActions(ref, onDelete: () => deleted = true),
          ),
        ],
        child: const MaterialApp(home: BlobLibraryPage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    final confirm = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, '确认删除'),
    );
    expect(confirm.onPressed, isNotNull);
    await tester.tap(find.text('确认删除'));
    await tester.pumpAndSettle();

    expect(deleted, isTrue);
    expect(find.text('文件已删除'), findsOneWidget); // SnackBar
  });
}

/// 假素材列表 notifier：build 直接返回固定数据（不发请求）。
class FakeBlobListNotifier extends BlobListNotifier {
  FakeBlobListNotifier(this.page);

  final BlobPage page;

  @override
  Future<BlobPage> build() async => page;
}

/// 假删除 action：记录调用，不发请求。
class _FakeBlobActions extends BlobActions {
  _FakeBlobActions(super.ref, {required this.onDelete});

  final void Function() onDelete;

  @override
  Future<void> delete(String blobId) async => onDelete();
}