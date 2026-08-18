// 消息流：user 右对齐气泡 / assistant 左对齐 markdown；新内容自动滚底。
// 向上滚动到顶部时懒加载更早的消息（prepend），保持视觉滚动位置不跳动。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_models.dart';
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
    final compactionSummary = ref.watch(
      aiControllerProvider.select((s) => s.compactionSummary),
    );
    final compactionTailStart = ref.watch(
      aiControllerProvider.select((s) => s.compactionTailStart),
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
    // 分页重同步（会话压缩，评审 B1）：重建了消息窗口 → 滚到底部而非当作
    // prepend 补偿（_appendingOlder 置 false，跳过上方 prepend 的补偿逻辑）。
    ref.listen(aiControllerProvider.select((s) => s.resyncTick), (prev, next) {
      if (prev == null || next == prev) return;
      _appendingOlder = false;
      _scrollToBottom();
    });

    final scheme = Theme.of(context).colorScheme;

    // 计数：有更多历史时头部多一个加载指示项；压缩摘要卡片多一项（评审 B2）
    final hasHeader = hasMoreMessages;
    final hasComp =
        compactionSummary != null && compactionTailStart <= messages.length;
    final itemCount = messages.length +
        (activeTurn != null ? 1 : 0) +
        (hasHeader ? 1 : 0) +
        (hasComp ? 1 : 0);

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
        final base = hasHeader ? index - 1 : index;
        // 压缩摘要卡（评审 B2）：插在可见窗口的 compactionTailStart 处（更早批次
        // 之后、保留消息之前），可展开展示压缩摘要，不参与 messages 数组/分页计数。
        if (hasComp && base == compactionTailStart) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: CompactionSummaryCard(
              message: RenderMessage(
                role: 'assistant',
                text: '已压缩早期对话',
                thinking: '',
                toolCalls: const [],
                kind: 'compaction',
                detail: compactionSummary,
              ),
            ),
          );
        }
        final msgIndex = base - (hasComp && base > compactionTailStart ? 1 : 0);
        if (activeTurn != null && msgIndex == messages.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: ActiveTurnView(turn: activeTurn),
          );
        }
        final m = messages[msgIndex];
        // 系统边界 marker（链延续的「已开启新会话」）与压缩摘要：不走左右气泡。
        if (m.isSystemMarker) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                Expanded(child: Divider(color: scheme.outlineVariant)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    m.text,
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
                Expanded(child: Divider(color: scheme.outlineVariant)),
              ],
            ),
          );
        }
        if (m.isCompactionSummary) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: CompactionSummaryCard(message: m),
          );
        }
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

/// 可折叠的「已压缩早期对话」摘要卡：默认折叠，点击展开 detail（kind='compaction'）。
class CompactionSummaryCard extends StatefulWidget {
  const CompactionSummaryCard({super.key, required this.message});
  final RenderMessage message;

  @override
  State<CompactionSummaryCard> createState() => _CompactionSummaryCardState();
}

class _CompactionSummaryCardState extends State<CompactionSummaryCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final summary = widget.message.detail?.isNotEmpty == true
        ? widget.message.detail!
        : widget.message.text;
    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => setState(() => _expanded = !_expanded),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.compress,
                    size: 16,
                    color: scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '已压缩早期对话',
                      style: TextStyle(
                        fontSize: 12,
                        color: scheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 16,
                    color: scheme.onSurfaceVariant,
                  ),
                ],
              ),
              if (_expanded && summary.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    summary,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
