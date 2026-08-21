import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../moment_models.dart';
import '../moment_providers.dart';

/// 朋友圈 3 列附件缩略图网格。>9 张折叠显示前 8 张 + 「+N 更多」瓦片，
/// 点「更多」就地展开全部。点击第 i 个瓦片回调 onTapTile(i)。
class AttachmentGrid extends ConsumerStatefulWidget {
  const AttachmentGrid({super.key, required this.attachments, required this.onTapTile});

  final List<MomentAttachment> attachments;
  final void Function(int index) onTapTile;

  @override
  ConsumerState<AttachmentGrid> createState() => _AttachmentGridState();
}

class _AttachmentGridState extends ConsumerState<AttachmentGrid> {
  static const _previewCount = 8;

  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final sorted = sortedAttachments(widget.attachments);
    final needsExpand = sorted.length > _previewCount + 1;
    final display =
        needsExpand && !_expanded ? sorted.sublist(0, _previewCount) : sorted;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
      ),
      itemCount: display.length + (needsExpand && !_expanded ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == display.length) {
          return _MoreTile(
            extra: sorted.length - _previewCount,
            onTap: () => setState(() => _expanded = true),
          );
        }
        final attachment = display[index];
        return _AttachmentTile(
          attachment: attachment,
          onTap: () => widget.onTapTile(index),
        );
      },
    );
  }
}

/// 第 9 格「+N 更多」瓦片。
class _MoreTile extends StatelessWidget {
  const _MoreTile({required this.extra, required this.onTap});

  final int extra;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.more_horiz, size: 28, color: scheme.onSurfaceVariant),
            Text('+$extra 更多',
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

class _AttachmentTile extends ConsumerWidget {
  const _AttachmentTile({required this.attachment, required this.onTap});

  final MomentAttachment attachment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blob = attachment.blob;
    final url = ref.watch(blobAccessUrlProvider(blob.id));
    final scheme = Theme.of(context).colorScheme;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: double.infinity,
          height: double.infinity,
          child: url.when(
            loading: () => ColoredBox(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              child: const Center(
                  child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, _) => ColoredBox(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              child: Icon(Icons.broken_image, color: scheme.onSurfaceVariant),
            ),
            data: (u) => switch (blob) {
              _ when blob.isImage => CachedNetworkImage(
                  imageUrl: u,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => const Center(
                      child: CircularProgressIndicator(strokeWidth: 2)),
                  errorWidget: (_, _, _) => ColoredBox(
                    color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                    child: Icon(Icons.broken_image, color: scheme.onSurfaceVariant),
                  ),
                ),
              _ when blob.isVideo => _VideoPlaceholder(durationMs: blob.duration),
              _ => _AudioPlaceholder(label: attachment.displayLabel),
            },
          ),
        ),
      ),
    );
  }
}

/// 视频瓦片占位：灰底 + ▶ + 时长。
class _VideoPlaceholder extends StatelessWidget {
  const _VideoPlaceholder({this.durationMs});

  final int? durationMs;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.play_circle_outline,
              size: 32, color: scheme.onSurfaceVariant),
          Positioned(
            right: 4,
            bottom: 4,
            child: Text(
              formatDurationMs(durationMs),
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// 音频/其他瓦片占位：灰底 + 图标 + 文件名。
class _AudioPlaceholder extends StatelessWidget {
  const _AudioPlaceholder({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.audio_file, size: 28, color: scheme.onSurfaceVariant),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// 毫秒 → mm:ss（不足 1 分钟补零；≥1 小时 h:mm:ss）。
String formatDurationMs(int? ms) {
  if (ms == null || ms <= 0) return '00:00';
  final totalSeconds = ms ~/ 1000;
  final h = totalSeconds ~/ 3600;
  final m = (totalSeconds % 3600) ~/ 60;
  final s = totalSeconds % 60;
  String two(int v) => v.toString().padLeft(2, '0');
  return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
}
