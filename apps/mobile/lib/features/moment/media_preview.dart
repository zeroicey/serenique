import 'dart:async';

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
  late final PageController _controller =
      PageController(initialPage: widget.initialIndex);
  late int _current = widget.initialIndex;

  /// 当前页是否处于放大状态：放大时 PageView 禁滑，
  /// 左右滑动交由图片平移，到边缘后由页面内溢出手势翻页。
  bool _zoomed = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onZoomChanged(bool zoomed) {
    if (_zoomed != zoomed) setState(() => _zoomed = zoomed);
  }

  /// 放大状态下从图片边缘溢出翻页：delta>0 上一张，delta<0 下一张。
  void _onEdgeSwipe(double overflowX) {
    if (!mounted) return;
    final target = _current - (overflowX > 0 ? 1 : -1);
    if (target < 0 || target >= widget.attachments.length) return;
    _controller.animateToPage(
      target,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final attachments = widget.attachments;
    return Stack(
      children: [
        PageView.builder(
          controller: _controller,
          // 放大时禁滑：避免左右滑动直接翻页，先平移图片（微信/iOS 相册行为）
          physics:
              _zoomed ? const NeverScrollableScrollPhysics() : null,
          itemCount: attachments.length,
          onPageChanged: (i) => setState(() => _current = i),
          itemBuilder: (ctx, i) => _MediaPage(
            attachment: attachments[i],
            onZoomChanged: _onZoomChanged,
            onEdgeSwipe: _onEdgeSwipe,
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: MediaQuery.of(context).padding.bottom + 16,
          child: Center(
            child: Text(
              '${_current + 1} / ${attachments.length}',
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 14,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MediaPage extends ConsumerStatefulWidget {
  const _MediaPage({
    required this.attachment,
    required this.onZoomChanged,
    required this.onEdgeSwipe,
  });

  final MomentAttachment attachment;
  final ValueChanged<bool> onZoomChanged;
  final ValueChanged<double> onEdgeSwipe;

  @override
  ConsumerState<_MediaPage> createState() => _MediaPageState();
}

class _MediaPageState extends ConsumerState<_MediaPage>
    with SingleTickerProviderStateMixin {
  static const _doubleTapScale = 2.5;

  /// 双击后摇：此时间内的单击被忽略（防快速连点误触发退出，对齐微信体验）。
  static const _doubleTapCooldown = Duration(milliseconds: 1200);

  /// 放大状态下水平滑到图片边缘、继续滑动超过该像素数 → 翻页。
  static const _edgeSwipeThreshold = 60.0;

  final _transformation = TransformationController();
  late final AnimationController _zoomController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  );
  // 单一 animation：toggle 只改 tween 端点再 forward，避免重复 addListener 互相覆盖。
  late final _zoomTween = Matrix4Tween(begin: Matrix4.identity(), end: Matrix4.identity());
  late final Animation<Matrix4> _zoomAnim = _zoomTween.animate(
      CurvedAnimation(parent: _zoomController, curve: Curves.easeOut));
  bool _zoomed = false;
  Offset _doubleTapFocal = Offset.zero;
  bool _inDoubleTapCooldown = false;
  Timer? _cooldownTimer;

  /// 本次手势累积的水平边缘溢出量（放大状态、已滑到图片边缘后继续滑动）。
  double _edgeOverflow = 0;

  MomentAttachment get _attachment => widget.attachment;

  @override
  void initState() {
    super.initState();
    _zoomAnim.addListener(() => _transformation.value = _zoomAnim.value);
    _transformation.addListener(_syncZoomState);
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _transformation.removeListener(_syncZoomState);
    _zoomController.dispose();
    _transformation.dispose();
    super.dispose();
  }

  void _syncZoomState() {
    final zoomed = _transformation.value.getMaxScaleOnAxis() > 1.01;
    if (zoomed != _zoomed) {
      _zoomed = zoomed;
      widget.onZoomChanged(zoomed);
    }
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

  /// 放大状态下跟踪水平边缘溢出：图片已滑到水平边缘、继续水平滑动
  /// 时累积距离；未到边缘则正常平移不清零累积（InteractiveViewer 自身
  /// 处理平移）。缩放/回缩时清零。
  void _handleInteractionUpdate(ScaleUpdateDetails details) {
    if (!_zoomed) {
      _edgeOverflow = 0;
      return;
    }
    final dx = details.focalPointDelta.dx;
    // InteractiveViewer 在边缘时会钳制平移，translation 不再变化；
    // 此时 focalPointDelta 仍报告手指位移 → 累积为溢出。
    final matrix = _transformation.value;
    final scale = matrix.getMaxScaleOnAxis();
    final tx = matrix.getTranslation().x;
    final viewportW = context.size?.width ?? 0;
    // 图片缩放后的可视宽度，平移到边缘时 tx 停在 [viewportW - w, 0]
    final imgW = viewportW * scale;
    final atRight = tx >= viewportW - imgW - 0.5; // 已到最左（图片左缘贴屏左）
    final atLeft = tx <= 0.5; // 已到最右（图片右缘贴屏右）
    if ((atRight && dx < 0) || (atLeft && dx > 0)) {
      _edgeOverflow += dx;
    }
  }

  void _handleInteractionEnd(ScaleEndDetails details) {
    final overflow = _edgeOverflow;
    _edgeOverflow = 0;
    if (overflow.abs() >= _edgeSwipeThreshold) {
      widget.onEdgeSwipe(overflow);
    }
  }

  @override
  Widget build(BuildContext context) {
    final blob = _attachment.blob;
    final url = ref.watch(blobAccessUrlProvider(blob.id));

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _handleTap,
      onDoubleTapDown: (details) =>
          _doubleTapFocal = details.localPosition,
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
                onInteractionUpdate: _handleInteractionUpdate,
                onInteractionEnd: _handleInteractionEnd,
                child: SizedBox.expand(
                  child: Image.network(
                    u,
                    fit: BoxFit.contain,
                    loadingBuilder: (_, child, progress) =>
                        progress == null ? child : const Center(child: CircularProgressIndicator()),
                    errorBuilder: (_, _, _) => Center(
                      child: Icon(Icons.broken_image,
                          size: 64, color: Colors.white54),
                    ),
                  ),
                ),
              )
            : blob.isVideo
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.play_circle_outline,
                            size: 72, color: Colors.white70),
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
                        Icon(Icons.audio_file,
                            size: 72, color: Colors.white70),
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
