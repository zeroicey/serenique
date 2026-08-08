import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'task_edit_sheet.dart';
import 'task_providers.dart';

/// Tab 1 任务组：组卡片列表（组名 + 未完成数），点击进组详情。
class TaskGroupListView extends ConsumerWidget {
  const TaskGroupListView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(taskGroupsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(taskGroupsProvider.future),
      child: groups.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) =>
            AsyncErrorView(error: err, onRetry: () => ref.invalidate(taskGroupsProvider)),
        data: (items) {
          if (items.isEmpty) {
            return ListView(children: [ListTile(title: Text('还没有任务组，点右下角新建'))]);
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: 16, endIndent: 16),
            itemBuilder: (context, index) {
              final g = items[index];
              final count = ref.watch(groupTodoCountProvider(g.id));
              return ListTile(
                leading: const Icon(Icons.folder_outlined),
                title: Text(g.title),
                trailing: count.when(
                  data: (n) => n > 0 ? Text('$n 项待办') : const Text(''),
                  loading: () => const SizedBox(
                      width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  error: (_, _) => const Text(''),
                ),
                onTap: () async {
                  await context.push('/task/groups/${g.id}');
                  if (context.mounted) {
                    ref.invalidate(groupTodoCountProvider(g.id));
                  }
                },
                onLongPress: () async {
                  final action = await showModalBottomSheet<String>(
                    context: context,
                    builder: (ctx) => SafeArea(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ListTile(title: Text(g.title), dense: true),
                          const Divider(height: 1),
                          ListTile(
                            leading: const Icon(Icons.edit_outlined),
                            title: const Text('重命名'),
                            onTap: () => Navigator.of(ctx).pop('rename'),
                          ),
                          ListTile(
                            leading: const Icon(Icons.delete_outline),
                            title: const Text('删除'),
                            onTap: () => Navigator.of(ctx).pop('delete'),
                          ),
                        ],
                      ),
                    ),
                  );
                  if (!context.mounted) return;
                  if (action == 'rename') {
                    final title = await showGroupNameDialog(context, initial: g.title);
                    if (title != null && context.mounted) {
                      await ref.read(taskActionsProvider).renameGroup(g.id, title);
                    }
                  } else if (action == 'delete') {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('删除任务组'),
                        content: Text('确定删除「${g.title}」？组内任务会一并删除，不可恢复。'),
                        actions: [
                          TextButton(
                              onPressed: () => Navigator.of(ctx).pop(false),
                              child: const Text('取消')),
                          FilledButton(
                              onPressed: () => Navigator.of(ctx).pop(true),
                              child: const Text('删除')),
                        ],
                      ),
                    );
                    if (ok == true && context.mounted) {
                      await ref.read(taskActionsProvider).deleteGroup(g.id);
                    }
                  }
                },
              );
            },
          );
        },
      ),
    );
  }
}
