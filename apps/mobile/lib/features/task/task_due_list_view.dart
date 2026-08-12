import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/async_view.dart';
import 'task_edit_page.dart';
import 'task_models.dart';
import 'task_providers.dart';
import 'task_time.dart';
import 'widgets/task_tile.dart';

/// 日期视图类型：今日 / 本周 / 本月。
enum TaskDueKind { today, week, month }

/// 今日 / 本周 / 本月 视图：只显示未完成任务。
/// 今日 tab 拆「已过期」与「今天」两组；周/月为单列表。
class TaskDueListView extends ConsumerWidget {
  const TaskDueListView({super.key, required this.kind});

  final TaskDueKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = switch (kind) {
      TaskDueKind.today => taskTodayProvider,
      TaskDueKind.week => taskWeekProvider,
      TaskDueKind.month => taskMonthProvider,
    };
    final tasks = ref.watch(provider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(provider.future),
      child: tasks.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) =>
            AsyncErrorView(error: err, onRetry: () => ref.invalidate(provider)),
        data: (items) {
          if (items.isEmpty) {
            return ListView(children: const [ListTile(title: Text('这段时间没有待办任务'))]);
          }
          return ListView(
            children: [
              if (kind == TaskDueKind.today) ...[
                _sectionHeader(context, '已过期'),
                for (final t in items
                    .where((t) => t.dueDate != null && t.dueDate!.compareTo(todayStr()) < 0))
                  _tile(ref, context, t, showOverdue: true),
                _sectionHeader(context, '今天'),
                for (final t in items
                    .where((t) => t.dueDate != null && t.dueDate!.compareTo(todayStr()) >= 0))
                  _tile(ref, context, t),
              ] else
                for (final t in items) _tile(ref, context, t),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionHeader(BuildContext context, String label) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Text(label,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: scheme.primary)),
    );
  }

  Widget _tile(WidgetRef ref, BuildContext context, TaskEntry t, {bool showOverdue = false}) {
    final groupTitle = ref.watch(groupTitleProvider(t.groupId)).value ?? '';
    return TaskTile(
      task: t,
      groupTitle: groupTitle,
      showOverdue: showOverdue,
      onToggle: () => ref.read(taskActionsProvider).toggleDone(t.id, t.status != 'done'),
      onTap: () => context.push('/task/edit', extra: TaskEditArgs(task: t)),
    );
  }
}
