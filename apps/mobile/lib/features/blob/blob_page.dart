import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/widgets/async_view.dart';
import 'blob_models.dart';
import 'blob_providers.dart';
import 'widgets/blob_delete_sheet.dart';
import 'widgets/blob_preview_overlay.dart';
import 'widgets/blob_tile.dart';

/// 素材库：查看对象存储中所有文件；图片可预览，其余显示元数据卡片；可删除（被引用时禁删）。
/// 顶部类型筛选（全部/图片/视频/音频）+ 三列网格 + 触底翻页 + 删除底部弹窗。
class BlobLibraryPage extends ConsumerStatefulWidget {
  const BlobLibraryPage({super.key});

  @override
  ConsumerState<BlobLibraryPage> createState() => _BlobPageState();
}

class _BlobPageState extends ConsumerState<BlobLibraryPage> {
  /// 触底阈值（像素）：距底部小于该值时触发加载下一页。
  static const _loadMoreThreshold = 240.0;

  final ScrollController _scrollController = ScrollController();

  /// 类型筛选选项：null = 全部（后端不支持「其他」排除过滤，非音视频归入全部）。
  static const _filters = <({String label, String? mimeType})>[
    (label: '全部', mimeType: null),
    (label: '图片', mimeType: 'image/'),
    (label: '视频', mimeType: 'video/'),
    (label: '音频', mimeType: 'audio/'),
  ];

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - _loadMoreThreshold) {
      ref.read(blobListProvider.notifier).loadMore();
    }
  }

  void _openPreview(List<BlobEntry> items, BlobEntry blob) {
    // 只预览图片；收集已加载签名直链的图片（未加载完成的不拦截点击——tile 里
    // 图片只有在直链就绪后才有可点缩略图，此处 read 必有值）。
    final imageItems = items.where((b) => b.isImage).toList();
    final index = imageItems.indexWhere((b) => b.id == blob.id);
    if (index < 0) return;
    final images = [
      for (final b in imageItems)
        (
          url: ref.read(blobAccessUrlProvider(b.id)).value ?? '',
          name: b.originalName,
        ),
    ];
    if (images.any((e) => e.url.isEmpty)) return;
    showBlobPreview(context, images: images, initialIndex: index);
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(blobFilterProvider);
    final list = ref.watch(blobListProvider);

    return Scaffold(
      body: Column(
        children: [
          // 类型筛选
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final f in _filters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(f.label),
                      selected: filter == f.mimeType,
                      onSelected: (_) =>
                          ref.read(blobFilterProvider.notifier).set(f.mimeType),
                    ),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: list.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (err, _) => AsyncErrorView(
                error: err,
                onRetry: () => ref.invalidate(blobListProvider),
              ),
              data: (page) {
                if (page.items.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      Padding(
                        padding: EdgeInsets.only(top: 120),
                        child: Text(
                          '暂无文件。文件由闪记等模块上传产生，素材库仅用于查看与管理。',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey),
                        ),
                      ),
                    ],
                  );
                }
                return _BlobGrid(
                  scrollController: _scrollController,
                  page: page,
                  onPreview: (blob) => _openPreview(page.items, blob),
                  onDelete: (blob) => showBlobDeleteSheet(context, ref, blob),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// 三列网格 + 触底加载下一页（有更多时底部显示细进度条）。
class _BlobGrid extends StatelessWidget {
  const _BlobGrid({
    required this.scrollController,
    required this.page,
    required this.onPreview,
    required this.onDelete,
  });

  final ScrollController scrollController;
  final BlobPage page;
  final void Function(BlobEntry blob) onPreview;
  final void Function(BlobEntry blob) onDelete;

  @override
  Widget build(BuildContext context) {
    final hasMore = page.items.length < page.total;
    return GridView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(4),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
      ),
      itemCount: page.items.length + (hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index >= page.items.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }
        final blob = page.items[index];
        return BlobTile(
          blob: blob,
          onPreview: () => onPreview(blob),
          onDelete: () => onDelete(blob),
        );
      },
    );
  }
}