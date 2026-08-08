import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../moment_providers.dart';

/// 浮动评论输入条：固定在页面底部（AI 聊天样式）。
/// 无外框装饰，直接输入框 + 发送按钮；键盘弹出时随 Scaffold body 上移。
class CommentInputBar extends ConsumerStatefulWidget {
  const CommentInputBar({super.key, required this.momentId});

  final String momentId;

  @override
  ConsumerState<CommentInputBar> createState() => _CommentInputBarState();
}

class _CommentInputBarState extends ConsumerState<CommentInputBar> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final content = _controller.text.trim();
    if (content.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      await ref
          .read(momentActionsProvider)
          .addComment(widget.momentId, content);
      _controller.clear();
      if (mounted) FocusScope.of(context).unfocus();
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // 底部留出 Home Indicator 安全区（viewPadding 比 padding 更可靠）。
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 6, 12, bottomInset + 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              maxLength: 2000,
              maxLines: 3,
              minLines: 1,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: '写评论…',
                isDense: true,
                filled: true,
                fillColor: scheme.surfaceContainerHighest,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                counterText: '',
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _submitting ? null : _send,
            icon: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send),
            tooltip: '发送',
          ),
        ],
      ),
    );
  }
}
