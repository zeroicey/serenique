// 消息流：user 右对齐气泡 / assistant 左对齐 markdown；新内容自动滚底。
// 向上滚动到顶部时懒加载更早的消息（prepend），保持视觉滚动位置不跳动。
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
  bool _appendingOlder = false; // 正在 prepend 历史消息（跳过滚底）
  double _prevScrollExtent = 0; // prepend 前的 scrollExtent，用于位置补偿

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  /// 触顶触发懒加载（顶部哨兵进入视口）。
  void _onScroll() {
    if (!_scroll.hasClients) return;
    // 接近顶部（< 50px）时触发，留余量避免精确 0 难命中
    if (_scroll.position.pixels < 50) {
      ref.read(aiControllerProvider.notifier).loadMore();
    }
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

  /// prepend 后保持视觉位置：新内容插入到顶部，滚动条会跳到新顶部；
  /// 补偿 scrollExtent 增量，让原视口内容保持在原位。
  void _preserveScrollOnPrepend() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final newExtent = _scroll.position.maxScrollExtent;
      final delta = newExtent - _prevScrollExtent;
      if (delta > 0) {
        _scroll.jumpTo(_scroll.position.pixels + delta);
      }
      _appendingOlder = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(aiControllerProvider.select((s) => s.messages));
    final activeTurn = ref.watch(
      aiControllerProvider.select((s) => s.activeTurn),
    );
    final hasMoreMessages = ref.watch(
      aiControllerProvider.select((s) => s.hasMoreMessages),
    );
    final loadingMore = ref.watch(
      aiControllerProvider.select((s) => s.loadingMore),
    );
    // activeTurn 实例在轮次内保持不变（就地更新字段），仅 watch text 才能在
    // 正文出现时触发「AI 正在思考…」→ MarkdownStream 的重建。值本身未被使用。
    ref.watch(aiControllerProvider.select((s) => s.activeTurn?.text));

    // 检测 prepend（头部增长）：messages[0] 变化且长度增长 → 保持滚动
    ref.listen(aiControllerProvider.select((s) => s.messages), (prev, next) {
      if (prev == null) return;
      if (next.length > prev.length &&
          prev.isNotEmpty &&
          next.isNotEmpty &&
          prev.first != next.first) {
        // prepend：记录当前 extent，下一帧补偿
        _appendingOlder = true;
        _prevScrollExtent = _scroll.hasClients
            ? _scroll.position.maxScrollExtent
            : 0;
        _preserveScrollOnPrepend();
      }
    });

    // 新消息/活跃轮变化 → 滚到底部（除非正在 prepend 历史消息）
    ref.listen(aiControllerProvider.select((s) => s.messages.length), (_, _) {
      if (!_appendingOlder) _scrollToBottom();
    });
    ref.listen(aiControllerProvider.select((s) => s.activeTurn?.text), (_, _) {
      if (!_appendingOlder) _scrollToBottom();
    });
    // activeTurn 实例变化（含 turnText 相同但工具卡新增）也滚底
    ref.listen(
      aiControllerProvider.select((s) => s.activeTurn?.toolCards.length),
      (_, _) {
        if (!_appendingOlder) _scrollToBottom();
      },
    );

    final scheme = Theme.of(context).colorScheme;

    // 计数：有更多历史时头部多一个加载指示项
    final hasHeader = hasMoreMessages;
    final itemCount =
        messages.length + (activeTurn != null ? 1 : 0) + (hasHeader ? 1 : 0);

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (hasHeader && index == 0) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: loadingMore
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      '向上滚动加载更多',
                      style: TextStyle(
                        fontSize: 12,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
            ),
          );
        }
        final msgIndex = hasHeader ? index - 1 : index;
        if (activeTurn != null && msgIndex == messages.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: ActiveTurnView(turn: activeTurn),
          );
        }
        final m = messages[msgIndex];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: m.role == 'user'
              ? Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 320),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
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
