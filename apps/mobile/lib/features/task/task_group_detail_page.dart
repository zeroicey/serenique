import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'task_edit_page.dart';
import 'task_providers.dart';
import 'widgets/task_tile.dart';

/// 任务组详情：组内全部任务（含已完成/已放弃），点条目编辑，勾选切换完成。
class TaskGroupDetailPage extends ConsumerWidget {
  const TaskGroupDetailPage({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(groupTasksProvider(groupId));
    final groupTitle = ref.watch(taskGroupsProvider).value
        ?.where((g) => g.id == groupId)
        .map((g) => g.title)
        .firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(groupTitle ?? '任务组')),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await context.push('/task/edit', extra: TaskEditArgs(groupId: groupId));
          if (context.mounted) ref.invalidate(groupTasksProvider(groupId));
        },
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(groupTasksProvider(groupId).future),
        child: tasks.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => AsyncErrorView(error: err, onRetry: () => ref.invalidate(groupTasksProvider(groupId))),
          data: (items) {
            if (items.isEmpty) {
              return ListView(children: const [ListTile(title: Text('这个任务组还没有任务'))]);
            }
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1, indent: 16, endIndent: 16),
              itemBuilder: (context, index) {
                final t = items[index];
                return TaskTile(
                  task: t,
                  groupTitle: '',
                  showOverdue: t.status == 'todo',
                  onToggle: () async {
                    await ref.read(taskActionsProvider).toggleDone(t.id, t.status != 'done');
                    if (context.mounted) ref.invalidate(groupTasksProvider(groupId)); // 家族 provider 不走全局 invalidate
                  },
                  onTap: () async {
                    await context.push('/task/edit', extra: TaskEditArgs(task: t));
                    if (context.mounted) ref.invalidate(groupTasksProvider(groupId));
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }
}
