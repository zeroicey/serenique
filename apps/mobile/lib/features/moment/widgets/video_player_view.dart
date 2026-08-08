import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import '../media_format.dart';

/// 视频播放器（video_player）+ 手写控制条：点按切换控制条显隐，
/// 播放/暂停 + 进度 Slider + 已播/总时长 + 全屏横竖屏切换。
class VideoPlayerView extends StatefulWidget {
  const VideoPlayerView({super.key, required this.url});

  final String url;

  @override
  State<VideoPlayerView> createState() => _VideoPlayerViewState();
}

class _VideoPlayerViewState extends State<VideoPlayerView> {
  // 可空：重试 _load() 时会释放旧 controller 再建新的。
  VideoPlayerController? _controller;
  bool _initialized = false;
  bool _loadFailed = false;
  bool _controlsVisible = true;
  bool _dragging = false;
  double _dragValue = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // 重试路径：先释放上一次的 controller（含监听移除），防止泄漏。
    final previous = _controller;
    if (previous != null) {
      previous.removeListener(_onTick);
      try {
        await previous.dispose();
      } catch (_) {
        // dispose 异常不阻塞重试。
      }
    }
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..addListener(_onTick);
    try {
      await _controller!.initialize();
      if (!mounted) return;
      setState(() {
        _initialized = true;
        _loadFailed = false;
      });
      _controller!.play();
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadFailed = true);
    }
  }

  void _onTick() {
    if (mounted && !_dragging) setState(() {});
  }

  void _togglePlay() {
    if (!_initialized) return;
    _controller!.value.isPlaying
        ? _controller!.pause()
        : _controller!.play();
  }

  void _toggleFullscreen() {
    if (_controller!.value.aspectRatio == 0) return;
    if (_isLandscape) {
      SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    } else {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    }
  }

  bool get _isLandscape {
    final o = MediaQuery.orientationOf(context);
    return o == Orientation.landscape;
  }

  @override
  void dispose() {
    final controller = _controller;
    if (controller != null) {
      controller.removeListener(_onTick);
      controller.dispose();
    }
    // 退出页面恢复竖屏（若用户切过全屏）。
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loadFailed) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.white54, size: 40),
            const SizedBox(height: 8),
            const Text('视频加载失败', style: TextStyle(color: Colors.white70)),
            TextButton(
              onPressed: () {
                setState(() => _loadFailed = false);
                _load();
              },
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }
    if (!_initialized) {
      return const Center(
        child: SizedBox(
          width: 36,
          height: 36,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
        ),
      );
    }

    final ratio = _controller!.value.aspectRatio == 0
        ? 16 / 9
        : _controller!.value.aspectRatio;
    return Center(
      child: AspectRatio(
        aspectRatio: ratio,
        child: GestureDetector(
          onTap: () => setState(() => _controlsVisible = !_controlsVisible),
          child: Stack(
            alignment: Alignment.center,
            children: [
              VideoPlayer(_controller!),
              // 点按切换控制条显隐
              if (_controlsVisible) ...[
                if (_controller!.value.isPlaying)
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 72,
                    child: _fadeBar(gradient: [Colors.black54, Colors.transparent]),
                  ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 72,
                  child: _fadeBar(gradient: [Colors.transparent, Colors.black54]),
                ),
                Center(child: IconButton(
                  iconSize: 56,
                  color: Colors.white,
                  icon: Icon(
                    _controller!.value.isPlaying
                        ? Icons.pause_circle_outline
                        : Icons.play_circle_outline,
                  ),
                  onPressed: _togglePlay,
                )),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _fadeBar({required List<Color> gradient}) {
    final position = _controller!.value.position;
    final duration = _controller!.value.duration;
    final maxMs =
        duration.inMilliseconds.toDouble().clamp(1, double.infinity).toDouble();
    // 不加 IgnorePointer：让 Slider（seek）与全屏按钮可以正常接收触摸。
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: gradient,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            Text(formatMediaDuration(position),
                style: const TextStyle(color: Colors.white, fontSize: 12)),
            Expanded(
              child: SliderTheme(
                data: SliderThemeData(
                  trackHeight: 2,
                  thumbShape:
                      const RoundSliderThumbShape(enabledThumbRadius: 6),
                  overlayShape:
                      const RoundSliderOverlayShape(overlayRadius: 12),
                ),
                child: Slider(
                  value: _dragging
                      ? _dragValue
                      : position.inMilliseconds.clamp(0, maxMs).toDouble(),
                  max: maxMs,
                  onChanged: (v) => setState(() {
                    _dragging = true;
                    _dragValue = v;
                  }),
                  onChangeEnd: (v) {
                    _controller!.seekTo(Duration(milliseconds: v.round()));
                    setState(() => _dragging = false);
                  },
                ),
              ),
            ),
            Text(formatMediaDuration(duration),
                style: const TextStyle(color: Colors.white, fontSize: 12)),
            IconButton(
              iconSize: 20,
              color: Colors.white,
              tooltip: _isLandscape ? '退出全屏' : '全屏',
              icon: Icon(_isLandscape
                  ? Icons.fullscreen_exit
                  : Icons.fullscreen),
              onPressed: _toggleFullscreen,
            ),
          ],
        ),
      ),
    );
  }
}
