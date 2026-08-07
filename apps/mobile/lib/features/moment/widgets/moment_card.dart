import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../moment_models.dart';
import '../moment_providers.dart';
import '../moment_time.dart';

/// 朋友圈样式的闪记卡片：纯文本（可展开）+ 时间行（全文/收起 + ⋮菜单）+ 内嵌评论 + 内联评论输入。
/// 评论、删除都直接在列表页操作，不需要点进详情。
class MomentCard extends ConsumerStatefulWidget {
  const MomentCard({super.key, required this.moment});

  final Moment moment;

  @override
  ConsumerState<MomentCard> createState() => _MomentCardState();
}

class _MomentCardState extends ConsumerState<MomentCard> {
  static const _collapseLines = 8;

  bool _expanded = false;
  bool _submitting = false;
  bool _deleting = false;
  final _commentController = TextEditingController();
  final _commentFocus = FocusNode();

  Moment get _moment => widget.moment;

  @override
  void dispose() {
    _commentController.dispose();
    _commentFocus.dispose();
    super.dispose();
  }

  Future<void> _submitComment() async {
    final content = _commentController.text.trim();
    if (content.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(momentActionsProvider).addComment(_moment.id, content);
      _commentController.clear();
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete() async {
    if (_deleting) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除这条闪记？'),
        content: const Text('删除后不可恢复。'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ref.read(momentActionsProvider).delete(_moment.id);
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final moment = _moment;
    final scheme = theme.colorScheme;

    return LayoutBuilder(
      builder: (context, constraints) {
        // 用 TextPainter 判断收起状态下是否真的会溢出，避免短文本也显示展开按钮。
        final style = theme.textTheme.bodyLarge!;
        final painter = TextPainter(
          text: TextSpan(text: moment.text, style: style),
          maxLines: _collapseLines,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = painter.didExceedMaxLines;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              moment.text,
              style: style,
              maxLines: _expanded ? null : _collapseLines,
              overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            // 时间行：时间靠左，全文/收起在右侧，⋮ 菜单在最右。
            Row(
              children: [
                Expanded(
                  child: Text(
                    formatMomentTime(moment.createdAt),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.hintColor),
                  ),
                ),
                if (overflows)
                  InkWell(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Padding(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                      child: Icon(
                        _expanded ? Icons.expand_less : Icons.expand_more,
                        size: 20,
                        color: theme.hintColor,
                      ),
                    ),
                  ),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_horiz),
                  tooltip: '更多',
                  onSelected: (value) {
                    if (value == 'comment') {
                      _commentFocus.requestFocus();
                    } else if (value == 'delete') {
                      _delete();
                    }
                  },
                  itemBuilder: (context) => const [
                    PopupMenuItem(value: 'comment', child: Text('评论')),
                    PopupMenuItem(value: 'delete', child: Text('删除')),
                  ],
                ),
              ],
            ),
            if (moment.comments.isNotEmpty) ...[
              const SizedBox(height: 10),
              _CommentBlock(comments: moment.comments),
            ],
            const SizedBox(height: 8),
            // 内联评论输入：列表页直接评论，不用点进详情。
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _commentController,
                    focusNode: _commentFocus,
                    maxLength: 2000,
                    maxLines: 3,
                    minLines: 1,
                    decoration: InputDecoration(
                      hintText: '写评论…',
                      isDense: true,
                      filled: true,
                      fillColor:
                          scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none,
                      ),
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _submitting ? null : _submitComment,
                  icon: const Icon(Icons.send),
                  tooltip: '发送',
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

/// 内嵌评论块：浅底色圆角容器，每条评论完整展示（不缩字号、不做展开）。
class _CommentBlock extends StatelessWidget {
  const _CommentBlock({required this.comments});

  final List<MomentComment> comments;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final c in comments)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Text(c.content),
            ),
        ],
      ),
    );
  }
}
