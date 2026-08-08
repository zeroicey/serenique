import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/audio_player_bar.dart';
import 'widgets/video_player_view.dart';

/// 全屏媒体预览（朋友圈样式）：黑底 PageView 左右滑动切换，
/// 图片可捏合缩放，视频/音频可播放。只构建当前页 → 翻页自动释放上一页播放器。
class MediaPreviewPage extends StatefulWidget {
  const MediaPreviewPage({
    super.key,
    required this.attachments,
    this.initialIndex = 0,
  });

  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  State<MediaPreviewPage> createState() => _MediaPreviewPageState();
}

class _MediaPreviewPageState extends State<MediaPreviewPage> {
  late final PageController _controller;
  late int _index;

  @override
  void initState() {
    super.initState();
    // 空列表先兜底（grid 只会从非空附件进入，防御性处理）
    _index = widget.attachments.isEmpty
        ? 0
        : widget.initialIndex.clamp(0, widget.attachments.length - 1);
    _controller = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.attachments.isEmpty) {
      return const Scaffold(backgroundColor: Colors.black);
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.attachments.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) =>
                _PreviewItem(attachment: widget.attachments[i]),
          ),
          // 顶部：关闭 + 计数
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    tooltip: '关闭',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  Expanded(
                    child: Center(
                      child: Text(
                        '${_index + 1} / ${widget.attachments.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewItem extends ConsumerWidget {
  const _PreviewItem({required this.attachment});

  final MomentAttachment attachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(blobAccessUrlProvider(attachment.blob.id));
    return url.when(
      loading: () => const Center(
        child: SizedBox(
          width: 36,
          height: 36,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
        ),
      ),
      error: (err, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white54, size: 40),
            const SizedBox(height: 8),
            const Text('加载失败', style: TextStyle(color: Colors.white70)),
            TextButton(
              onPressed: () => ref.invalidate(blobAccessUrlProvider(attachment.blob.id)),
              child: const Text('重试', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
      data: (u) {
        if (attachment.isImage) {
          return Center(
            child: InteractiveViewer(
              maxScale: 4,
              child: Image.network(
                u,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Icon(
                    Icons.broken_image_outlined,
                    color: Colors.white54,
                    size: 48),
              ),
            ),
          );
        }
        if (attachment.isVideo) {
          return VideoPlayerView(url: u);
        }
        if (attachment.isAudio) {
          return Center(
            child: AudioPlayerBar(url: u, title: attachment.displayLabel),
          );
        }
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.insert_drive_file_outlined,
                  color: Colors.white54, size: 48),
              const SizedBox(height: 8),
              Text(attachment.displayLabel,
                  style: const TextStyle(color: Colors.white70)),
            ],
          ),
        );
      },
    );
  }
}
