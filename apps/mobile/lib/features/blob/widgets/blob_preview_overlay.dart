import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// 素材库全屏图片预览遮罩：在当前页面之上盖黑底淡入（不 push 新页面）。
/// 左右滑动切换、底部居中 1/N 计数、点击图片关闭（无关闭按钮）。
/// 只接收 url+name 列表（不强改 moment 的 showMediaPreview，避免侵入既有组件）。
Future<void> showBlobPreview(
  BuildContext context, {
  required List<({String url, String name})> images,
  required int initialIndex,
}) {
  return showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black,
    barrierDismissible: false,
    transitionDuration: const Duration(milliseconds: 150),
    pageBuilder: (ctx, _, _) => BlobPreviewOverlay(
      images: images,
      initialIndex: initialIndex,
    ),
    transitionBuilder: (ctx, animation, _, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}

class BlobPreviewOverlay extends StatefulWidget {
  const BlobPreviewOverlay({
    super.key,
    required this.images,
    required this.initialIndex,
  });

  final List<({String url, String name})> images;
  final int initialIndex;

  @override
  State<BlobPreviewOverlay> createState() => _BlobPreviewOverlayState();
}

class _BlobPreviewOverlayState extends State<BlobPreviewOverlay> {
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );
  late int _current = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    return Stack(
      children: [
        PageView.builder(
          controller: _controller,
          itemCount: images.length,
          onPageChanged: (i) => setState(() => _current = i),
          itemBuilder: (ctx, i) => _PreviewPage(image: images[i]),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: MediaQuery.of(context).padding.bottom + 16,
          child: Center(
            child: Text(
              '${_current + 1} / ${images.length}',
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ),
        ),
      ],
    );
  }
}

class _PreviewPage extends StatelessWidget {
  const _PreviewPage({required this.image});

  final ({String url, String name}) image;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => Navigator.of(context).pop(),
      child: CachedNetworkImage(
        imageUrl: image.url,
        fit: BoxFit.contain,
        placeholder: (_, _) => const Center(
          child: CircularProgressIndicator(),
        ),
        errorWidget: (_, _, _) => Center(
          child: Icon(Icons.broken_image, size: 64, color: Colors.white54),
        ),
      ),
    );
  }
}