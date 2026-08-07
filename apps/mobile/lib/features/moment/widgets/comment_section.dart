import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../moment_models.dart';
import '../moment_providers.dart';
import 'comment_row.dart';

/// 评论区：新增 + 删除。评论数据来自 momentDetailProvider（评论内嵌在详情里）。
/// 评论区与列表一致：直接平铺展示全部评论，不显示条数、不缩字号。
class CommentSection extends ConsumerStatefulWidget {
  const CommentSection({super.key, required this.momentId});

  final String momentId;

  @override
  ConsumerState<CommentSection> createState() => _CommentSectionState();
}

class _CommentSectionState extends ConsumerState<CommentSection> {
  final _controller = TextEditingController();
  bool _submitting = false;
  bool _removing = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final content = _controller.text.trim();
    if (content.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(momentActionsProvider).addComment(widget.momentId, content);
      _controller.clear();
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (comments.isNotEmpty)
          Container(
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
          ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                maxLength: 2000,
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: '写评论…',
                  isDense: true,
                  filled: true,
                  fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
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
              onPressed: _submitting ? null : _add,
              icon: const Icon(Icons.send),
              tooltip: '发送',
            ),
          ],
        ),
      ],
    );
  }
}
