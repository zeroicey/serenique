import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/async_view.dart';
import '../moment/moment_models.dart';
import '../moment/moment_providers.dart';
import 'tag_providers.dart';

/// 标签管理页：顶部新建输入条 + 标签列表（名称/使用数/重命名/删除）。
/// 点击标签 → 进入按该标签过滤的闪记列表（写 momentTagFilterProvider 并跳 /moments）。
class TagPage extends ConsumerStatefulWidget {
  const TagPage({super.key});

  @override
  ConsumerState<TagPage> createState() => _TagPageState();
}

class _TagPageState extends ConsumerState<TagPage> {
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('请输入标签名')));
      return;
    }
    if (name.length > 32) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('标签名不能超过 32 个字符')));
      return;
    }
    try {
      await ref.read(tagActionsProvider).create(name);
      if (!mounted) return;
      _nameController.clear();
      FocusScope.of(context).unfocus();
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_tagError(err))));
      }
    }
  }

  Future<void> _rename(MomentTag tag) async {
    final name = await _renameTagDialog(context, tag.name);
    if (name == null || name.isEmpty || name == tag.name || !mounted) return;
    try {
      await ref.read(tagActionsProvider).rename(tag.id, name);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(_tagError(err))));
      }
    }
  }

  Future<void> _delete(MomentTag tag) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除标签'),
        content: Text('确定删除「${tag.name}」吗？删除后不可恢复（不影响闪记正文）。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(tagActionsProvider).delete(tag.id);
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(humanizeError(err))));
      }
    }
  }

  /// 进入按标签过滤的闪记列表：写过滤态（列表 notifier 重建）并跳转闪记页。
  void _openTagged(MomentTag tag) {
    ref.read(momentTagFilterProvider.notifier).set(tag.id);
    context.go('/moments');
  }

  String _tagError(Object err) {
    final msg = humanizeError(err);
    // 409 = 标签名重复（后端唯一约束），给可操作中文提示。
    if (msg.contains('409') || msg.contains('CONFLICT')) return '标签已存在';
    return msg;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tags = ref.watch(tagsProvider);

    // 新建输入条：随内容滚动（列表第一条）。
    final createRow = Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _nameController,
              maxLength: 32,
              onSubmitted: (_) => _create(),
              decoration: InputDecoration(
                hintText: '新建标签',
                counterText: '',
                isDense: true,
                filled: true,
                fillColor: scheme.surfaceContainerHighest,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _create,
            icon: const Icon(Icons.add),
            tooltip: '创建标签',
          ),
        ],
      ),
    );

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(tagsProvider);
          await ref.read(tagsProvider.future);
        },
        child: tags.when(
          loading: () => Column(
            children: [
              createRow,
              const Expanded(child: Center(child: CircularProgressIndicator())),
            ],
          ),
          error: (err, _) => Column(
            children: [
              createRow,
              Expanded(
                child: AsyncErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(tagsProvider),
                ),
              ),
            ],
          ),
          data: (list) {
            return RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(tagsProvider);
                await ref.read(tagsProvider.future);
              },
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: list.length + 1,
                separatorBuilder: (_, index) {
                  if (index == 0) return const SizedBox.shrink();
                  return const Divider(height: 1, indent: 16, endIndent: 16);
                },
                itemBuilder: (context, index) {
                  if (index == 0) return createRow;
                  final tag = list[index - 1];
                  return ListTile(
                    leading: Icon(Icons.sell_outlined, color: scheme.primary),
                    title: Text(tag.name),
                    subtitle: Text('${tag.momentCount} 条闪记'),
                    trailing: PopupMenuButton<String>(
                      tooltip: '操作',
                      onSelected: (value) {
                        if (value == 'rename') _rename(tag);
                        if (value == 'delete') _delete(tag);
                      },
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 'rename', child: Text('重命名')),
                        PopupMenuItem(value: 'delete', child: Text('删除')),
                      ],
                    ),
                    onTap: () => _openTagged(tag),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }
}

/// 重命名标签对话框：自持 TextEditingController（避免在对话框淡出动画期间
/// 被外部 dispose —— 那会触发 “used after being disposed”）。
Future<String?> _renameTagDialog(BuildContext context, String initial) {
  return showDialog<String>(
    context: context,
    builder: (_) => _RenameTagDialog(initial: initial),
  );
}

class _RenameTagDialog extends StatefulWidget {
  const _RenameTagDialog({required this.initial});

  final String initial;

  @override
  State<_RenameTagDialog> createState() => _RenameTagDialogState();
}

class _RenameTagDialogState extends State<_RenameTagDialog> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initial,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() => Navigator.of(context).pop(_controller.text.trim());

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('重命名标签'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        maxLength: 32,
        decoration: const InputDecoration(hintText: '标签名'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('取消'),
        ),
        FilledButton(onPressed: _submit, child: const Text('保存')),
      ],
    );
  }
}
