import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../moment_models.dart';
import '../moment_providers.dart';

/// 评论区：列表 + 新增 + 删除。评论数据来自 momentDetailProvider（评论内嵌在详情里）。
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

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(momentDetailProvider(widget.momentId));
    final comments = detail.hasValue ? detail.value!.comments : <MomentComment>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('评论', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (comments.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('暂无评论'),
          ),
        for (final c in comments)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(c.content),
            subtitle: Text(c.createdAt, style: Theme.of(context).textTheme.bodySmall),
            trailing: IconButton(
              icon: const Icon(Icons.close, size: 18),
              tooltip: '删除评论',
              onPressed: _removing ? null : () => _remove(c.id),
            ),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                maxLength: 2000,
                maxLines: 3,
                minLines: 1,
                decoration: const InputDecoration(
                    hintText: '写评论…', border: OutlineInputBorder(), counterText: ''),
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
