// 输入区：多行输入 + 发送/停止按钮。
// - 空闲：发送按钮；AI 回复中：输入框禁用 + 停止按钮（abort）。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    notifier.send(text);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final busy = ref.watch(aiControllerProvider.select((s) => s.busy));
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
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                ),
              ),
            ),
            const SizedBox(width: 8),
            busy
                ? IconButton.filled(
                    tooltip: '停止',
                    icon: const Icon(Icons.stop, size: 20),
                    onPressed: () => ref.read(aiControllerProvider.notifier).abort(),
                  )
                : IconButton.filled(
                    tooltip: '发送',
                    icon: const Icon(Icons.send, size: 20),
                    onPressed: _send,
                  ),
          ],
        ),
      ),
    );
  }
}
