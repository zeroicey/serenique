import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../media_format.dart';
import '../media_preview_page.dart';
import '../moment_models.dart';
import '../moment_providers.dart';

/// 朋友圈式附件 3 列网格：图片缩略图 / 视频 ▶ / 音频图标。
/// 超过 9 个折叠显示前 8 个 +「+N 更多」；点击瓦片进入全屏预览。
class AttachmentGrid extends ConsumerStatefulWidget {
  const AttachmentGrid({super.key, required this.attachments});

  final List<MomentAttachment> attachments;

  @override
  ConsumerState<AttachmentGrid> createState() => _AttachmentGridState();
}

class _AttachmentGridState extends ConsumerState<AttachmentGrid> {
  static const _previewCount = 8;

  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final sorted = [...widget.attachments]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final needsExpand = sorted.length > _previewCount + 1;
    final display = needsExpand && !_expanded
        ? sorted.take(_previewCount).toList()
        : sorted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          children: [
            for (final (i, a) in display.indexed)
              _AttachmentTile(
                attachment: a,
                all: sorted,
                index: i,
              ),
            if (needsExpand && !_expanded)
              _MoreTile(
                count: sorted.length - _previewCount,
                onTap: () => setState(() => _expanded = true),
              ),
          ],
        ),
      ],
    );
  }
}

class _AttachmentTile extends ConsumerWidget {
  const _AttachmentTile({
    required this.attachment,
    required this.all,
    required this.index,
  });

  final MomentAttachment attachment;
  final List<MomentAttachment> all;
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(blobAccessUrlProvider(attachment.blob.id));
    final scheme = Theme.of(context).colorScheme;
    return AspectRatio(
      aspectRatio: 1,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => MediaPreviewPage(attachments: all, initialIndex: index),
          )),
          child: url.when(
            loading: () => ColoredBox(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              child: const Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
            error: (_, _) => const _FileTile(icon: Icons.broken_image_outlined),
            data: (u) => attachment.isImage
                // Hero 共享元素：缩略图放大飞入全屏预览（微信/小红书式过渡）。
                ? Hero(
                    tag: 'blob-${attachment.blob.id}',
                    child: _tileBody(context, u),
                  )
                : _tileBody(context, u),
          ),
        ),
      ),
    );
  }

  Widget _tileBody(BuildContext context, String url) {
    if (attachment.isImage) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) =>
            const _FileTile(icon: Icons.broken_image_outlined),
      );
    }
    if (attachment.isVideo) {
      return _FileTile(
        icon: Icons.play_circle_outline,
        size: 36,
        footer: attachment.blob.duration != null
            ? formatMediaDuration(
                Duration(milliseconds: attachment.blob.duration!))
            : null,
      );
    }
    if (attachment.isAudio) {
      return _FileTile(
        icon: Icons.music_note,
        footer: attachment.displayLabel,
      );
    }
    return _FileTile(icon: Icons.insert_drive_file_outlined);
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({required this.icon, this.size = 28, this.footer});

  final IconData icon;
  final double size;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
      alignment: Alignment.center,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: size, color: scheme.onSurfaceVariant),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
              child: Text(
                footer!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );
  }
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AspectRatio(
      aspectRatio: 1,
      child: Material(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Center(
            child: Text(
              '+$count 更多',
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
          ),
        ),
      ),
    );
  }
}
