import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'media_preview.dart';
import 'moment_models.dart';
import 'moment_providers.dart';
import 'moment_time.dart';
import 'widgets/attachment_grid.dart';
import 'widgets/comment_input_bar.dart';
import 'widgets/comment_section.dart';

/// 闪记详情页 —— 正文可直接编辑（微信发布纯文本样式），右上角保存。
/// 底部评论区用 SafeArea 兜住系统手势条/曲面屏安全距离。
class MomentDetailPage extends ConsumerStatefulWidget {
  const MomentDetailPage({super.key, required this.id});

  final String id;

  @override
  ConsumerState<MomentDetailPage> createState() => _MomentDetailPageState();
}

class _MomentDetailPageState extends ConsumerState<MomentDetailPage> {
  final _controller = TextEditingController();
  bool _loaded = false;
  bool _saving = false;
  bool _deleting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(momentActionsProvider)
          .update(widget.id, text);
      if (mounted) context.pop();
    } on Exception catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(humanizeError(e))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
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
    if (ok != true || !context.mounted) return;
    setState(() => _deleting = true);
    try {
      await ref.read(momentActionsProvider).delete(widget.id);
      if (mounted) context.pop();
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
    final detail = ref.watch(momentDetailProvider(widget.id));
    if (!_loaded && detail.hasValue) {
      _loaded = true;
      _controller.text = detail.value!.text;
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('闪记详情'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: '删除',
            onPressed: _deleting ? null : _delete,
          ),
          IconButton(
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            tooltip: '保存',
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(
            error: err, onRetry: () => ref.invalidate(momentDetailProvider(widget.id))),
        data: (moment) {
          // 网格与全屏预览共用同一有序列表，保证索引一致。
          final attachments = sortedAttachments(moment.attachments);
          return SafeArea(
            top: false,
            child: Stack(
              children: [
                ListView(
                  // 顶部间距收紧；底部留出浮动输入条的空间。
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                  children: [
                    TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: null,
                      textAlignVertical: TextAlignVertical.top,
                      style: theme.textTheme.bodyLarge,
                      decoration: const InputDecoration(
                        hintText: '写下此刻的想法…',
                        border: InputBorder.none,
                      ),
                    ),
                    // 附件网格：正文下方，间距收紧。
                    if (moment.attachments.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      AttachmentGrid(
                        attachments: attachments,
                        onTapTile: (index) => showMediaPreview(
                          context,
                          attachments: attachments,
                          initialIndex: index,
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      formatMomentTime(moment.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.hintColor),
                    ),
                    const SizedBox(height: 12),
                    CommentSection(momentId: moment.id),
                  ],
                ),
                // 浮动评论输入条：随 body 一起 resize，键盘弹出时自动上移。
                Align(
                  alignment: Alignment.bottomCenter,
                  child: CommentInputBar(momentId: moment.id),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
