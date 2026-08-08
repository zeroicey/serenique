import 'dart:io';

import 'package:flutter/material.dart';
import '../moment_models.dart';
import 'attachment_grid.dart';

/// 发布页本地附件 3 列网格：图片显示本地缩略图（失败回退灰底图标）、
/// 视频灰底 ▶+时长、音频图标+文件名；瓦片右上角 ✕ 删除；末尾「+」添加瓦片。
class LocalAttachmentGrid extends StatelessWidget {
  const LocalAttachmentGrid({super.key, required this.attachments, required this.onRemove, required this.onAdd});

  final List<PickedAttachment> attachments;
  final ValueChanged<int> onRemove;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3, mainAxisSpacing: 4, crossAxisSpacing: 4),
      itemCount: attachments.length + 1,
      itemBuilder: (context, index) {
        if (index == attachments.length) return _AddTile(onTap: onAdd);
        return _LocalTile(attachment: attachments[index], onRemove: () => onRemove(index));
      },
    );
  }
}

class _AddTile extends StatelessWidget {
  const _AddTile({required this.onTap});
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
        child: Icon(Icons.add, color: scheme.onSurfaceVariant),
      ),
    );
  }
}

class _LocalTile extends StatelessWidget {
  const _LocalTile({required this.attachment, required this.onRemove});
  final PickedAttachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final a = attachment;
    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: a.isImage
              ? (a.localPath != null
                  ? Image.file(File(a.localPath!), fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => ColoredBox(
                        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                        child: Icon(Icons.image, color: scheme.onSurfaceVariant)))
                  : ColoredBox(color: scheme.surfaceContainerHighest.withValues(alpha: 0.6)))
              : a.isVideo
                  ? ColoredBox(
                      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                      child: Stack(alignment: Alignment.center, children: [
                        Icon(Icons.play_circle_outline, size: 32, color: scheme.onSurfaceVariant),
                        if (a.durationMs != null)
                          Positioned(right: 4, bottom: 4, child: Text(
                            formatDurationMs(a.durationMs),
                            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant))),
                      ]))
                  : ColoredBox(
                      color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(Icons.audio_file, size: 28, color: scheme.onSurfaceVariant),
                          const SizedBox(height: 4),
                          Text(a.filename, maxLines: 2, overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                        ]),
                      )),
        ),
        Positioned(
          top: 2, right: 2,
          child: InkWell(
            onTap: onRemove,
            child: Container(
              decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
              padding: const EdgeInsets.all(2),
              child: const Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}
