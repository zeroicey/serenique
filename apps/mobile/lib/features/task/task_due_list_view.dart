import 'package:flutter/material.dart';

/// 日期视图类型：今日 / 本周 / 本月。
enum TaskDueKind { today, week, month }

/// 占位实现（Task 10 将替换为完整的日期视图）：仅保持接口稳定，
/// 让 TaskPage 的 4 个 tab 可以先行编译。
class TaskDueListView extends StatelessWidget {
  const TaskDueListView({super.key, required this.kind});

  final TaskDueKind kind;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
