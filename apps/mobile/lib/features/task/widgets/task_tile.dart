import 'package:flutter/material.dart';
import '../task_models.dart';
import '../task_time.dart';

/// 任务条目：勾选圈 + 标题 + 组名/截止徽标；done 划线。
class TaskTile extends StatelessWidget {
  const TaskTile({
    super.key,
    required this.task,
    required this.groupTitle,
    this.onToggle,
    this.onTap,
    this.showOverdue = false,
  });

  final TaskEntry task;
  final String groupTitle;
  final VoidCallback? onToggle;
  final VoidCallback? onTap;
  final bool showOverdue;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final done = task.status == 'done';
    final overdue =
        showOverdue && task.dueDate != null && task.dueDate!.compareTo(todayStr()) < 0;
    return ListTile(
      onTap: onTap,
      leading: InkWell(
        onTap: onToggle,
        borderRadius: BorderRadius.circular(20),
        child: Icon(
          done ? Icons.check_circle : Icons.radio_button_unchecked,
          color: done ? scheme.primary : scheme.outline,
        ),
      ),
      title: Text(
        task.title,
        style: done
            ? TextStyle(decoration: TextDecoration.lineThrough, color: scheme.outline)
            : null,
      ),
      subtitle: Text(groupTitle, style: TextStyle(fontSize: 12, color: scheme.outline)),
      trailing: task.dueDate == null
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: overdue ? scheme.errorContainer : scheme.secondaryContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                dueDateLabel(task.dueDate!),
                style: TextStyle(
                  fontSize: 12,
                  color: overdue ? scheme.onErrorContainer : scheme.onSecondaryContainer,
                ),
              ),
            ),
    );
  }
}
