import 'package:flutter/material.dart';
import '../task_models.dart';
import '../task_time.dart';

/// 任务条目：勾选圈 + 标题 + 组名/截止徽标；done 划线。
///
/// 不用 ListTile：默认实现会把 leading 与「标题+副标题」整体垂直居中，
/// 导致勾选图标比标题低约 8px。这里用 Row 顶部对齐布局，勾选图标
/// （40x40 点击区内的 24px icon，顶部对齐）与标题首行（bodyLarge 行高
/// 24）的中心自然落在同一水平线。
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
    final hasDueDate = task.dueDate != null;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 勾选圈：40x40 点击区，icon 顶部对齐 → 中心与标题首行中心重合。
            InkWell(
              onTap: onToggle,
              borderRadius: BorderRadius.circular(20),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Align(
                  alignment: Alignment.topCenter,
                  child: Icon(
                    done ? Icons.check_circle : Icons.radio_button_unchecked,
                    size: 24,
                    color: done ? scheme.primary : scheme.outline,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    task.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: done
                        ? TextStyle(
                            decoration: TextDecoration.lineThrough,
                            color: scheme.outline,
                          )
                        : Theme.of(context).textTheme.bodyLarge,
                  ),
                  Text(
                    groupTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: scheme.outline),
                  ),
                ],
              ),
            ),
            if (hasDueDate) ...[
              const SizedBox(width: 8),
              Container(
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
            ],
          ],
        ),
      ),
    );
  }
}
