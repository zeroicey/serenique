import 'package:flutter/material.dart';
import '../task_models.dart';
import '../task_time.dart';

/// 任务条目：勾选圈 + 标题 + 组名/截止徽标；done 划线。
///
/// 对齐规则：勾选图标中心 = 标题「第一行」的竖直中心（标题过长自动换行时
/// 勾选框固定在首行，不随内容块整体居中）。用 IntrinsicHeight + stretch
/// 让徽标区撑满内容高度并整体居中；标题不限行数，过长换行不省略。
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
    final titleStyle = Theme.of(context).textTheme.bodyLarge!;
    final done = task.status == 'done';
    final overdue =
        showOverdue && task.dueDate != null && task.dueDate!.compareTo(todayStr()) < 0;
    final hasDueDate = task.dueDate != null;
    final showSubtitle = groupTitle.isNotEmpty;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 勾选圈：宽 40 的点击区，图标顶对齐内容块顶边 → 与标题第一行
              // 水平居中对齐（bodyLarge 行高 24 ≈ 图标 24）。
              InkWell(
                onTap: onToggle,
                borderRadius: BorderRadius.circular(20),
                child: SizedBox(
                  width: 40,
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
                  mainAxisAlignment: MainAxisAlignment.start,
                  children: [
                    Text(
                      task.title,
                      style: done
                          ? titleStyle.copyWith(
                              decoration: TextDecoration.lineThrough,
                              color: scheme.outline,
                            )
                          : titleStyle,
                    ),
                    if (showSubtitle)
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
                Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: overdue
                          ? scheme.errorContainer
                          : scheme.secondaryContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      dueDateLabel(task.dueDate!),
                      style: TextStyle(
                        fontSize: 12,
                        color: overdue
                            ? scheme.onErrorContainer
                            : scheme.onSecondaryContainer,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
