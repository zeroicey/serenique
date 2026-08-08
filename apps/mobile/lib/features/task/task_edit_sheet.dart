import 'package:flutter/material.dart';
import 'task_models.dart';

/// 占位实现（Task 10 将替换为完整的任务创建/编辑底部弹窗）：仅保持接口稳定，
/// 让 TaskPage 的 FAB 可以先行编译；当前点击提示开发中。
Future<void> showTaskEditSheet(
  BuildContext context, {
  TaskEntry? task,
  String? groupId,
  String? presetDueDate,
}) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text('任务编辑功能开发中')),
  );
  return Future.value();
}

/// 任务组新建/改名对话框，返回新标题或 null（取消）。
Future<String?> showGroupNameDialog(BuildContext context, {String? initial}) {
  final controller = TextEditingController(text: initial ?? '');
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(initial == null ? '新建任务组' : '重命名任务组'),
      content: TextField(controller: controller, autofocus: true, maxLength: 200),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () {
            final v = controller.text.trim();
            if (v.isNotEmpty) Navigator.of(ctx).pop(v);
          },
          child: const Text('确定'),
        ),
      ],
    ),
  );
}
