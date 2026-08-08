import 'dart:async';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import '../media_format.dart';

/// 音频播放条（just_audio）：播放/暂停 + 进度 Slider + 时长 + 文件名。
class AudioPlayerBar extends StatefulWidget {
  const AudioPlayerBar({super.key, required this.url, required this.title});

  final String url;
  final String title;

  @override
  State<AudioPlayerBar> createState() => _AudioPlayerBarState();
}

class _AudioPlayerBarState extends State<AudioPlayerBar> {
  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<Duration?>? _durationSub;
  StreamSubscription<PlayerState>? _stateSub;
  bool _loading = true;
  bool _loadFailed = false;
  bool _dragging = false;
  double _dragValue = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
    });
    await _positionSub?.cancel();
    await _durationSub?.cancel();
    await _stateSub?.cancel();
    // 重试期间被销毁则直接返回，避免重建泄漏的订阅。
    if (!mounted) return;
    _positionSub = _player.positionStream.listen((_) {
      if (mounted && !_dragging) setState(() {});
    });
    _durationSub = _player.durationStream.listen((_) {
      if (mounted) setState(() {});
    });
    _stateSub = _player.playerStateStream.listen((_) {
      if (mounted) setState(() {});
    });
    try {
      await _player.setUrl(widget.url);
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadFailed = true;
        });
      }
    }
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _durationSub?.cancel();
    _stateSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loadFailed) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('音频加载失败',
              style: TextStyle(color: Colors.white70)),
          TextButton(
            onPressed: _load,
            child: const Text('重试'),
          ),
        ],
      );
    }
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 32,
          height: 32,
          child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 3),
        ),
      );
    }

    final duration = _player.duration;
    final maxMs = (duration?.inMilliseconds ?? 0).clamp(1, double.infinity).toDouble();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320),
          child: Text(
            widget.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 15),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              iconSize: 48,
              color: Colors.white,
              icon: Icon(_player.playing ? Icons.pause_circle : Icons.play_circle),
              onPressed: () {
                if (_player.playing) {
                  _player.pause();
                } else {
                  _player.play();
                }
              },
            ),
            SizedBox(
              width: 220,
              child: SliderTheme(
                data: SliderThemeData(
                  trackHeight: 2,
                  thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                  overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                ),
                child: Slider(
                  value: _dragging
                      ? _dragValue
                      : _player.position.inMilliseconds.clamp(0, maxMs).toDouble(),
                  max: maxMs,
                  onChanged: (v) => setState(() {
                    _dragging = true;
                    _dragValue = v;
                  }),
                  onChangeEnd: (v) {
                    _player.seek(Duration(milliseconds: v.round()));
                    setState(() => _dragging = false);
                  },
                ),
              ),
            ),
          ],
        ),
        Text(
          '${formatMediaDuration(_player.position)} / ${formatMediaDuration(duration ?? Duration.zero)}',
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }
}
