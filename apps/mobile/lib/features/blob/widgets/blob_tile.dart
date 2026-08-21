import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../blob_models.dart';
import '../blob_providers.dart';

/// 素材网格卡片：图片 → 签名直链缩略图；其他类型 → 图标 + 文件名 + 大小。
/// 右上角删除按钮、左上角「在用」徽标（refCount>0）。图片可预览，非图片仅展示。
class BlobTile extends ConsumerWidget {
  const BlobTile({
    super.key,
    required this.blob,
    required this.onPreview,
    required this.onDelete,
  });

  final BlobEntry blob;
  final VoidCallback onPreview;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // 主体：图片（点击预览）或文件占位
            if (blob.isImage)
              InkWell(
                onTap: onPreview,
                child: _BlobImage(blobId: blob.id, name: blob.originalName),
              )
            else
              _FilePlaceholder(blob: blob),
            // 在用徽标
            if (blob.isReferenced)
              Positioned(
                top: 4,
                left: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: scheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '在用 · ${blob.refCount}',
                    style: TextStyle(
                      fontSize: 10,
                      color: scheme.onSecondaryContainer,
                    ),
                  ),
                ),
              ),
            // 删除按钮
            Positioned(
              top: 2,
              right: 2,
              child: IconButton.filledTonal(
                tooltip: '删除',
                icon: const Icon(Icons.delete_outline, size: 18),
                constraints: const BoxConstraints.tightFor(
                  width: 30,
                  height: 30,
                ),
                padding: EdgeInsets.zero,
                onPressed: onDelete,
              ),
            ),
            // 图片底部文件名
            if (blob.isImage)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(6, 2, 6, 3),
                  color: Colors.black.withValues(alpha: 0.35),
                  child: Text(
                    blob.originalName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10, color: Colors.white),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// 图片缩略图：签名直链加载，URL 稳定缓存命中后秒开。
class _BlobImage extends ConsumerWidget {
  const _BlobImage({required this.blobId, required this.name});

  final String blobId;
  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(blobAccessUrlProvider(blobId));
    return url.when(
      loading: () => _ImagePlaceholder(icon: Icons.image_outlined, name: name),
      error: (_, _) => const _ImagePlaceholder(icon: Icons.broken_image_outlined),
      data: (u) => CachedNetworkImage(
        imageUrl: u,
        fit: BoxFit.cover,
        placeholder: (_, _) => const ColoredBox(color: Colors.transparent),
        errorWidget: (_, _, _) =>
            const _ImagePlaceholder(icon: Icons.broken_image_outlined),
      ),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder({required this.icon, this.name});

  final IconData icon;
  final String? name;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 28, color: scheme.outline),
          if (name != null) ...[
            const SizedBox(height: 2),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                name!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: scheme.outline),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 非图片文件占位：类型图标 + 文件名 + 大小。
class _FilePlaceholder extends StatelessWidget {
  const _FilePlaceholder({required this.blob});

  final BlobEntry blob;

  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }

  IconData _icon() {
    if (blob.isVideo) return Icons.videocam_outlined;
    if (blob.isAudio) return Icons.audio_file_outlined;
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(_icon(), size: 28, color: scheme.outline),
          const SizedBox(height: 4),
          Text(
            blob.originalName,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11),
          ),
          const SizedBox(height: 2),
          Text(
            '${formatBytes(blob.size)} · ${blob.mimeType.split('/').last}',
            style: TextStyle(fontSize: 10, color: scheme.outline),
          ),
        ],
      ),
    );
  }
}