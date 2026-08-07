import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import 'diary_providers.dart';

/// 日记编辑页 —— 微信发布纯文本的样式：返回键在左上，保存按钮在右上，正文无边框。
class DiaryEditPage extends ConsumerStatefulWidget {
  const DiaryEditPage({super.key, required this.date});

  final String date; // YYYY-MM-DD

  @override
  ConsumerState<DiaryEditPage> createState() => _DiaryEditPageState();
}

class _DiaryEditPageState extends ConsumerState<DiaryEditPage> {
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
    final content = _controller.text.trim();
    if (content.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('内容不能为空')));
      return;
    }
    final existingId = ref.read(diaryByDateProvider(widget.date)).value?.id;
    setState(() => _saving = true);
    try {
      await ref.read(diaryActionsProvider).save(
            existingId: existingId,
            date: widget.date,
            content: content,
          );
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
    final existing = ref.read(diaryByDateProvider(widget.date)).value;
    if (existing == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除这篇日记？'),
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
      await ref.read(diaryActionsProvider).delete(id: existing.id, date: widget.date);
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
    final entry = ref.watch(diaryByDateProvider(widget.date));
    if (!_loaded && entry.hasValue) {
      _loaded = true;
      _controller.text = entry.value?.content ?? '';
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.date),
        actions: [
          if (entry.hasValue && entry.value != null)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: '删除日记',
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
      body: entry.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => AsyncErrorView(
            error: err, onRetry: () => ref.invalidate(diaryByDateProvider(widget.date))),
        data: (_) => Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _controller,
            maxLines: null,
            expands: true,
            textAlignVertical: TextAlignVertical.top,
            decoration: const InputDecoration(
              hintText: '写下今天的日记…',
              border: InputBorder.none,
            ),
          ),
        ),
      ),
    );
  }
}
