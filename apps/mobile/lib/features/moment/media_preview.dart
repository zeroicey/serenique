import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/attachment_grid.dart' show formatDurationMs;

/// 全屏媒体预览遮罩：在当前页面之上盖黑底淡入（不 push 新页面）。
/// 左右滑动切换；底部居中 1/N 计数；点图片/占位页关闭（无关闭按钮）。
Future<void> showMediaPreview(
  BuildContext context, {
  required List<MomentAttachment> attachments,
  required int initialIndex,
}) {
  return showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black,
    barrierDismissible: false,
    transitionDuration: const Duration(milliseconds: 150),
    pageBuilder: (ctx, _, _) => MediaPreviewOverlay(
      attachments: attachments,
      initialIndex: initialIndex,
    ),
    transitionBuilder: (ctx, animation, _, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}

class MediaPreviewOverlay extends ConsumerStatefulWidget {
  const MediaPreviewOverlay({
    super.key,
    required this.attachments,
    required this.initialIndex,
  });

  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  ConsumerState<MediaPreviewOverlay> createState() =>
      _MediaPreviewOverlayState();
}

class _MediaPreviewOverlayState extends ConsumerState<MediaPreviewOverlay> {
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
    final attachments = widget.attachments;
    return Stack(
      children: [
        PageView.builder(
          controller: _controller,
          itemCount: attachments.length,
          onPageChanged: (i) => setState(() => _current = i),
          itemBuilder: (ctx, i) => _MediaPage(attachment: attachments[i]),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: MediaQuery.of(context).padding.bottom + 16,
          child: Center(
            child: Text(
              '${_current + 1} / ${attachments.length}',
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ),
        ),
      ],
    );
  }
}

class _MediaPage extends ConsumerStatefulWidget {
  const _MediaPage({required this.attachment});

  final MomentAttachment attachment;

  @override
  ConsumerState<_MediaPage> createState() => _MediaPageState();
}

class _MediaPageState extends ConsumerState<_MediaPage>
    with SingleTickerProviderStateMixin {
  static const _doubleTapScale = 2.5;

  /// 双击后摇：此时间内的单击被忽略（防快速连点误触发退出，对齐微信体验）。
  static const _doubleTapCooldown = Duration(milliseconds: 1500);

  final _transformation = TransformationController();
  late final AnimationController _zoomController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );
  // 单一 animation：toggle 只改 tween 端点再 forward，避免重复 addListener 互相覆盖。
  late final _zoomTween = Matrix4Tween(
    begin: Matrix4.identity(),
    end: Matrix4.identity(),
  );
  late final Animation<Matrix4> _zoomAnim = _zoomTween.animate(
    CurvedAnimation(parent: _zoomController, curve: Curves.easeOut),
  );
  bool _zoomed = false;
  Offset _doubleTapFocal = Offset.zero;
  bool _inDoubleTapCooldown = false;
  Timer? _cooldownTimer;

  MomentAttachment get _attachment => widget.attachment;

  @override
  void initState() {
    super.initState();
    _zoomAnim.addListener(() => _transformation.value = _zoomAnim.value);
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _zoomController.dispose();
    _transformation.dispose();
    super.dispose();
  }

  /// 以 focal 为中心的缩放矩阵：translate(focal) · scale · translate(-focal)。
  static Matrix4 _focalScaleMatrix(Offset focal, double scale) {
    return Matrix4.identity()
      ..translateByDouble(focal.dx, focal.dy, 0, 1)
      ..scaleByDouble(scale, scale, 1, 1)
      ..translateByDouble(-focal.dx, -focal.dy, 0, 1);
  }

  /// 双击：以手指位置为中心 1x ↔ 2.5x 平滑缩放（重新以当前变换为起点）。
  void _toggleZoom() {
    final target = _zoomed
        ? Matrix4.identity()
        : _focalScaleMatrix(_doubleTapFocal, _doubleTapScale);
    _zoomTween
      ..begin = _transformation.value
      ..end = target;
    _zoomController.forward(from: 0);
    setState(() => _zoomed = !_zoomed);
  }

  /// 单击关闭：双击后摇期间忽略（狂按连点不误退）。
  void _handleTap() {
    if (_inDoubleTapCooldown) return;
    Navigator.of(context).pop();
  }

  /// 双击入口：缩放 + 进入后摇。
  void _handleDoubleTap() {
    _toggleZoom();
    _inDoubleTapCooldown = true;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer(_doubleTapCooldown, () {
      if (mounted) setState(() => _inDoubleTapCooldown = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final blob = _attachment.blob;
    final url = ref.watch(blobAccessUrlProvider(blob.id));

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _handleTap,
      onDoubleTapDown: (details) => _doubleTapFocal = details.localPosition,
      onDoubleTap: _handleDoubleTap,
      child: url.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Icon(Icons.broken_image, size: 64, color: Colors.white54),
        ),
        data: (u) => blob.isImage
            ? InteractiveViewer(
                transformationController: _transformation,
                minScale: 1,
                maxScale: 4,
                child: SizedBox.expand(
                  child: CachedNetworkImage(
                    imageUrl: u,
                    fit: BoxFit.contain,
                    placeholder: (_, _) =>
                        const Center(child: CircularProgressIndicator()),
                    errorWidget: (_, _, _) => Center(
                      child: Icon(
                        Icons.broken_image,
                        size: 64,
                        color: Colors.white54,
                      ),
                    ),
                  ),
                ),
              )
            : blob.isVideo
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.play_circle_outline,
                      size: 72,
                      color: Colors.white70,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      formatDurationMs(blob.duration),
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              )
            : Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.audio_file, size: 72, color: Colors.white70),
                    const SizedBox(height: 8),
                    Text(
                      _attachment.displayLabel,
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
