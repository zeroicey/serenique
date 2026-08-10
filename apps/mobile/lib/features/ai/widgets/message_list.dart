// 消息流：user 右对齐气泡 / assistant 左对齐 markdown；新内容自动滚底。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';
import 'assistant_message.dart';

class MessageList extends ConsumerStatefulWidget {
  const MessageList({super.key});

  @override
  ConsumerState<MessageList> createState() => _MessageListState();
}

class _MessageListState extends ConsumerState<MessageList> {
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(aiControllerProvider.select((s) => s.messages));
    final activeTurn = ref.watch(aiControllerProvider.select((s) => s.activeTurn));
    // activeTurn 实例在轮次内保持不变（就地更新字段），仅 watch text 才能在
    // 正文出现时触发「AI 正在思考…」→ MarkdownStream 的重建。值本身未被使用。
    ref.watch(aiControllerProvider.select((s) => s.activeTurn?.text));

    ref.listen(aiControllerProvider.select((s) => s.messages.length), (_, _) {
      _scrollToBottom();
    });
    ref.listen(aiControllerProvider.select((s) => s.activeTurn?.text), (_, _) {
      _scrollToBottom();
    });
    // activeTurn 实例变化（含 turnText 相同但工具卡新增）也滚底
    ref.listen(aiControllerProvider.select((s) => s.activeTurn?.toolCards.length), (_, _) {
      _scrollToBottom();
    });

    final scheme = Theme.of(context).colorScheme;

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: messages.length + (activeTurn != null ? 1 : 0),
      itemBuilder: (context, index) {
        if (activeTurn != null && index == messages.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: ActiveTurnView(turn: activeTurn),
          );
        }
        final m = messages[index];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: m.role == 'user'
              ? Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 320),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(m.text, style: const TextStyle(fontSize: 14)),
                  ),
                )
              : Align(
                  alignment: Alignment.centerLeft,
                  child: AssistantMessageView(message: m),
                ),
        );
      },
    );
  }
}
