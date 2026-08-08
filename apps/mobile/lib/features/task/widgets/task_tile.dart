import 'package:flutter/material.dart';
import '../task_models.dart';
import '../task_time.dart';

/// 任务条目：勾选圈 + 标题 + 组名/截止徽标；done 划线。
///
/// 对齐规则：勾选图标中心 = 内容块（标题+副标题整体）的竖直中心。
/// 用 IntrinsicHeight + stretch 让图标区高度跟随内容自适应——带组名时
/// 图标对「标题+组名」整体居中，组详情（无组名副标题）时对标题行居中。
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
    final showSubtitle = groupTitle.isNotEmpty;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 勾选圈：宽 40 的点击区，高度自适应内容，图标居中于内容块。
              InkWell(
                onTap: onToggle,
                borderRadius: BorderRadius.circular(20),
                child: SizedBox(
                  width: 40,
                  child: Center(
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
                  mainAxisAlignment: MainAxisAlignment.center,
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
