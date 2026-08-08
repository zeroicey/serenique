import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../moment_models.dart';
import '../moment_providers.dart';
import 'comment_row.dart';

/// 评论区：只展示评论列表（新增/删除）。输入框已拆到
/// [CommentInputBar]（详情页底部浮动条）。
/// 与列表一致：直接平铺展示全部评论，不显示条数、不缩字号。
class CommentSection extends ConsumerStatefulWidget {
  const CommentSection({super.key, required this.momentId});

  final String momentId;

  @override
  ConsumerState<CommentSection> createState() => _CommentSectionState();
}

class _CommentSectionState extends ConsumerState<CommentSection> {
  bool _removing = false;

  Future<void> _remove(String commentId) async {
    if (_removing) return;
    setState(() => _removing = true);
    try {
      await ref
          .read(momentActionsProvider)
          .deleteComment(widget.momentId, commentId);
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _removing = false);
    }
  }

  /// 长按评论 → 底部弹层（微信风格）：删除 / 取消。
  Future<void> _showDeleteSheet(MomentComment comment) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '删除这条评论？',
                  style: Theme.of(ctx).textTheme.titleSmall,
                ),
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('删除', style: TextStyle(color: Colors.red)),
              onTap: () => Navigator.pop(ctx, true),
            ),
          ],
        ),
      ),
    );
    if (ok == true && mounted) {
      await _remove(comment.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(momentDetailProvider(widget.momentId));
    final comments = detail.hasValue ? detail.value!.comments : <MomentComment>[];
    final scheme = Theme.of(context).colorScheme;
    if (comments.isEmpty) return const SizedBox.shrink();
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
            CommentRow(
              comment: c,
              onLongPress: () => _showDeleteSheet(c),
            ),
        ],
      ),
    );
  }
}
