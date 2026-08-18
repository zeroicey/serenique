// 输入区：多行输入 + 发送/停止按钮。
// - 空闲：发送按钮；AI 回复中：输入框禁用 + 停止按钮（abort）。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_client.dart';
import '../ai_providers.dart';

class ComposerBar extends ConsumerStatefulWidget {
  const ComposerBar({super.key});

  @override
  ConsumerState<ComposerBar> createState() => _ComposerBarState();
}

class _ComposerBarState extends ConsumerState<ComposerBar> {
  final TextEditingController _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send() {
    final notifier = ref.read(aiControllerProvider.notifier);
    final text = _input.text.trim();
    if (text.isEmpty || ref.read(aiControllerProvider).busy) return;
    // 斜杠命令拦截在 controller.sendInput（/new /compact → 命令；未知 → false）。
    final consumed = notifier.sendInput(text);
    if (consumed) {
      _input.clear();
    } else {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('未知命令，可用：/new /compact')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = ref.watch(aiControllerProvider.select((s) => s.busy));
    // 未连接（connecting/offline）时禁发：离线时 controller.send 会丢弃消息。
    final status = ref.watch(aiControllerProvider.select((s) => s.status));
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                enabled: !busy,
                minLines: 1,
                maxLines: 4,
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: busy ? 'AI 正在回复…' : '输入消息',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            busy
                ? IconButton.filled(
                    tooltip: '停止',
                    icon: const Icon(Icons.stop, size: 20),
                    onPressed: () =>
                        ref.read(aiControllerProvider.notifier).abort(),
                  )
                : IconButton.filled(
                    tooltip: '发送',
                    icon: const Icon(Icons.send, size: 20),
                    onPressed: busy || status != AiConnStatus.online
                        ? null
                        : _send,
                  ),
          ],
        ),
      ),
    );
  }
}
