import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_view_plus/photo_view_plus.dart';
import 'package:photo_view_plus/photo_view_plus_gallery.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'widgets/audio_player_bar.dart';
import 'widgets/video_player_view.dart';

/// 全屏媒体预览（朋友圈/小红书样式），基于 photo_view_plus（photo_view 维护分支）：
/// - 图片页：PhotoViewGallery，`covered` 初始铺满全屏（无黑边），可捏合缩回 contained 看全图、
///   双击放大；`heroAttributes` 与网格缩略图 Hero 同 tag → 从小放大飞入过渡。
/// - 视频/音频页：`customChild` 复用 VideoPlayerView / AudioPlayerBar。
/// 只构建当前页 → 翻页自动释放上一页播放器。顶部控制条（关闭 + 计数）默认隐藏，
/// 点按唤出后 2.5 秒自动隐藏；预览期间隐藏系统状态栏。
class MediaPreviewPage extends ConsumerStatefulWidget {
  const MediaPreviewPage({
    super.key,
    required this.attachments,
    this.initialIndex = 0,
  });

  final List<MomentAttachment> attachments;
  final int initialIndex;

  @override
  ConsumerState<MediaPreviewPage> createState() => _MediaPreviewPageState();
}

class _MediaPreviewPageState extends ConsumerState<MediaPreviewPage> {
  late final PageController _controller;
  late int _index;
  bool _controlsVisible = false;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    // 空列表先兜底（grid 只会从非空附件进入，防御性处理）
    _index = widget.attachments.isEmpty
        ? 0
        : widget.initialIndex.clamp(0, widget.attachments.length - 1);
    _controller = PageController(initialPage: _index);
    // 沉浸式全屏：隐藏系统状态栏，退出页面时恢复。
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _controller.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => _controlsVisible = false);
    });
  }

  void _toggleControls() {
    setState(() => _controlsVisible = !_controlsVisible);
    if (_controlsVisible) _scheduleHide();
  }

  /// PhotoView 的 tap 回调：点按唤出/隐藏控制条（外层 GestureDetector
  /// 会在手势竞技场输给 PhotoView 的 tap 识别器，必须走这里）。
  void _onTapUp(
      BuildContext context, TapUpDetails details, PhotoViewControllerValue value) {
    _toggleControls();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.attachments.isEmpty) {
      return const Scaffold(backgroundColor: Colors.black);
    }
    // 逐个附件解析签名 URL（网格已预热缓存，几乎瞬时）；全部就绪后构建图库。
    final urls = <String, AsyncValue<String>>{};
    var anyLoading = false;
    for (final a in widget.attachments) {
      final v = ref.watch(blobAccessUrlProvider(a.blob.id));
      urls[a.id] = v;
      if (v.isLoading) anyLoading = true;
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          if (anyLoading)
            const Center(
              child: SizedBox(
                width: 36,
                height: 36,
                child: CircularProgressIndicator(
                    color: Colors.white70, strokeWidth: 3),
              ),
            )
          else
            // 点按唤出控制条由 PhotoView 自己的 onTapUp 处理（外层 GestureDetector
            // 会在手势竞技场输给 PhotoView 的 tap 识别器）。
            PhotoViewGallery(
                pageController: _controller,
                onPageChanged: (i) => setState(() => _index = i),
                backgroundDecoration: const BoxDecoration(color: Colors.black),
                loadingBuilder: (context, event) => const Center(
                  child: SizedBox(
                    width: 36,
                    height: 36,
                    child: CircularProgressIndicator(
                        color: Colors.white70, strokeWidth: 3),
                  ),
                ),
                pageOptions: [
                  for (final a in widget.attachments)
                    _pageOption(a, urls[a.id]!),
                ],
              ),
          // 顶部：关闭 + 计数（默认隐藏，点按唤出，2.5 秒自动隐藏）
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              ignoring: !_controlsVisible,
              child: AnimatedOpacity(
                opacity: _controlsVisible ? 1 : 0,
                duration: const Duration(milliseconds: 200),
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
                            style: const TextStyle(
                                color: Colors.white, fontSize: 14),
                          ),
                        ),
                      ),
                      const SizedBox(width: 48),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  PhotoViewGalleryPageOptions _pageOption(
      MomentAttachment a, AsyncValue<String> url) {
    // Riverpod 3：.value 在无数据时为 null
    final u = url.value;
    if (a.isImage) {
      if (u == null) {
        return PhotoViewGalleryPageOptions.customChild(
          disableGestures: true,
          onTapUp: _onTapUp,
          child: _LoadError(
            onRetry: () =>
                ref.invalidate(blobAccessUrlProvider(a.blob.id)),
          ),
        );
      }
      return PhotoViewGalleryPageOptions(
        imageProvider: NetworkImage(u),
        // 与网格缩略图 Hero tag 一致 → 共享元素过渡（从小放大飞入）
        heroAttributes: PhotoViewHeroAttributes(tag: 'blob-${a.blob.id}'),
        // covered：初始铺满全屏无黑边；minScale contained：可捏合缩回看全图
        initialScale: PhotoViewScale.covered,
        minScale: PhotoViewScale.contained,
        maxScale: PhotoViewComputedScale.contained * 4,
        onTapUp: _onTapUp,
        errorBuilder: (_, _, _) => const Icon(
            Icons.broken_image_outlined,
            color: Colors.white54,
            size: 48),
      );
    }
    if (a.isVideo) {
      return PhotoViewGalleryPageOptions.customChild(
        disableGestures: true,
        onTapUp: _onTapUp,
        child: u == null
            ? _LoadError(
                onRetry: () =>
                    ref.invalidate(blobAccessUrlProvider(a.blob.id)))
            : VideoPlayerView(url: u),
      );
    }
    if (a.isAudio) {
      return PhotoViewGalleryPageOptions.customChild(
        disableGestures: true,
        onTapUp: _onTapUp,
        child: u == null
            ? _LoadError(
                onRetry: () =>
                    ref.invalidate(blobAccessUrlProvider(a.blob.id)))
            : AudioPlayerBar(url: u, title: a.displayLabel),
      );
    }
    return PhotoViewGalleryPageOptions.customChild(
      disableGestures: true,
      onTapUp: _onTapUp,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.insert_drive_file_outlined,
                color: Colors.white54, size: 48),
            const SizedBox(height: 8),
            Text(a.displayLabel,
                style: const TextStyle(color: Colors.white70)),
          ],
        ),
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, color: Colors.white54, size: 40),
          const SizedBox(height: 8),
          const Text('加载失败', style: TextStyle(color: Colors.white70)),
          TextButton(
            onPressed: onRetry,
            child: const Text('重试', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
