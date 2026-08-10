// 宁序 AI 助手页：消息流 + 输入栏 + 离线横幅 + 错误提示。
// 挂载即连接（幂等）；App 回前台且离线时自动重连。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'ai_client.dart';
import 'ai_providers.dart';
import 'widgets/composer_bar.dart';
import 'widgets/message_list.dart';

class AiPage extends ConsumerStatefulWidget {
  const AiPage({super.key});

  @override
  ConsumerState<AiPage> createState() => _AiPageState();
}

class _AiPageState extends ConsumerState<AiPage> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.read(aiControllerProvider.notifier).connect(),
    );
    // 首帧后连接（避免 build 期间读 state）
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(aiControllerProvider.notifier).connect();
    });
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(aiControllerProvider.select((s) => s.status));

    ref.listen(aiControllerProvider.select((s) => s.lastError), (prev, next) {
      if (next == null || next == prev) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(next)));
    });

    return Column(
      children: [
        Expanded(child: MessageList()),
        // 重连（回前台自动重连）期间无离线横幅，用细进度条指示连接中。
        if (status == AiConnStatus.connecting)
          const LinearProgressIndicator(minHeight: 2),
        if (status == AiConnStatus.offline)
          _OfflineBanner(
            onRetry: () => ref.read(aiControllerProvider.notifier).connect(),
          ),
        const ComposerBar(),
      ],
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Row(
          children: [
            Icon(Icons.cloud_off, size: 16, color: scheme.onErrorContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '连接已断开',
                style: TextStyle(fontSize: 13, color: scheme.onErrorContainer),
              ),
            ),
            TextButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}
