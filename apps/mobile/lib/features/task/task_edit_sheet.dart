import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import 'task_models.dart';
import 'task_providers.dart';
import 'task_time.dart';

/// 打开任务创建/编辑底部弹窗。
/// [task] 为空 = 新建；[groupId] 预设所属组；[presetDueDate] 预设截止日期（日期 tab 新建时预填）。
Future<void> showTaskEditSheet(
  BuildContext context, {
  TaskEntry? task,
  String? groupId,
  String? presetDueDate,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _TaskEditSheet(task: task, initialGroupId: groupId, presetDueDate: presetDueDate),
    ),
  );
}

class _TaskEditSheet extends ConsumerStatefulWidget {
  const _TaskEditSheet({this.task, this.initialGroupId, this.presetDueDate});

  final TaskEntry? task;
  final String? initialGroupId;
  final String? presetDueDate;

  @override
  ConsumerState<_TaskEditSheet> createState() => _TaskEditSheetState();
}

class _TaskEditSheetState extends ConsumerState<_TaskEditSheet> {
  late final TextEditingController _title =
      TextEditingController(text: widget.task?.title ?? '');
  String? _groupId;
  String? _dueDate;
  String _status = 'todo';
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _groupId = widget.task?.groupId ?? widget.initialGroupId;
    _dueDate = widget.task?.dueDate ?? widget.presetDueDate;
    _status = widget.task?.status ?? 'todo';
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(taskGroupsProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.task == null ? '新建任务' : '编辑任务',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: '标题', border: OutlineInputBorder()),
              maxLength: 200,
            ),
            const SizedBox(height: 8),
            groups.when(
              loading: () => const LinearProgressIndicator(),
              error: (err, _) => Text(humanizeError(err)),
              data: (list) {
                if (list.isEmpty) {
                  return const Text('请先创建任务组');
                }
                return DropdownButtonFormField<String>(
                  initialValue:
                      _groupId != null && list.any((g) => g.id == _groupId) ? _groupId : list.first.id,
                  decoration: const InputDecoration(labelText: '所属任务组'),
                  items: [for (final g in list) DropdownMenuItem(value: g.id, child: Text(g.title))],
                  onChanged: (v) => setState(() => _groupId = v),
                );
              },
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: Text(_dueDate == null ? '截止日期' : dueDateLabel(_dueDate!)),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_dueDate != null)
                    IconButton(
                        icon: const Icon(Icons.close), onPressed: () => setState(() => _dueDate = null)),
                  const Icon(Icons.chevron_right),
                ],
              ),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _dueDate != null ? DateTime.parse(_dueDate!) : DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100),
                );
                if (picked != null) setState(() => _dueDate = dateStr(picked));
              },
            ),
            if (widget.task != null)
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: '状态'),
                items: const [
                  DropdownMenuItem(value: 'todo', child: Text('待办')),
                  DropdownMenuItem(value: 'done', child: Text('已完成')),
                  DropdownMenuItem(value: 'abandon', child: Text('已放弃')),
                ],
                onChanged: (v) => setState(() => _status = v ?? 'todo'),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(widget.task == null ? '创建' : '保存'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请输入任务标题')));
      return;
    }
    final actions = ref.read(taskActionsProvider);
    setState(() => _submitting = true);
    try {
      final groupId = _groupId;
      if (groupId == null) throw Exception('未选择任务组');
      if (widget.task == null) {
        await actions.createTask(title: title, groupId: groupId, dueDate: _dueDate);
      } else {
        await actions.updateTask(
          widget.task!.id,
          title: title,
          status: _status,
          dueDate: _dueDate,
          clearDueDate: _dueDate == null && widget.task!.dueDate != null,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(humanizeError(e))));
    }
  }
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
