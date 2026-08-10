// 日程新建/编辑合一底部弹窗：标题 / 全天 / 开始 / 结束 / 地点 / 备注。
// [day] 预填创建日期（新建）；[event] 非空 = 编辑。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../event_models.dart';
import '../event_providers.dart';
import '../event_time.dart';

Future<void> showEventEditSheet(
  BuildContext context, {
  String? day,
  EventEntry? event,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _EventEditSheet(day: day, event: event),
    ),
  );
}

class _EventEditSheet extends ConsumerStatefulWidget {
  const _EventEditSheet({this.day, this.event});

  final String? day;
  final EventEntry? event;

  @override
  ConsumerState<_EventEditSheet> createState() => _EventEditSheetState();
}

class _EventEditSheetState extends ConsumerState<_EventEditSheet> {
  late final TextEditingController _title =
      TextEditingController(text: widget.event?.title ?? '');
  late final TextEditingController _location =
      TextEditingController(text: widget.event?.location ?? '');
  late final TextEditingController _note =
      TextEditingController(text: widget.event?.note ?? '');
  late bool _allDay;
  late DateTime _start;
  late DateTime _end;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final editing = widget.event;
    if (editing != null) {
      // 后端 ISO 归一化 UTC，回填前必须 .toLocal()。
      _allDay = editing.isAllDay;
      _start = DateTime.parse(editing.startAt).toLocal();
      _end = DateTime.parse(editing.endAt).toLocal();
    } else {
      final d = dayFromKey(widget.day ?? todayKey());
      _allDay = false;
      _start = DateTime(d.year, d.month, d.day, 9);
      _end = DateTime(d.year, d.month, d.day, 10);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _note.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<DateTime?> _pickDateTime(DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null) return null;
    if (!mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<DateTime?> _pickDate(DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (date == null) return null;
    return DateTime(date.year, date.month, date.day);
  }

  Future<void> _pickStart() async {
    final picked = _allDay ? await _pickDate(_start) : await _pickDateTime(_start);
    if (picked == null || !mounted) return;
    setState(() {
      _start = picked;
      if (!_end.isAfter(_start)) _end = _start.add(const Duration(hours: 1));
    });
  }

  Future<void> _pickEnd() async {
    final picked = _allDay ? await _pickDate(_end) : await _pickDateTime(_end);
    if (picked == null || !mounted) return;
    setState(() => _end = picked);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.event == null ? '新建日程' : '编辑日程',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: '标题', border: OutlineInputBorder()),
              maxLength: 200,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('全天'),
              value: _allDay,
              onChanged: (v) => setState(() => _allDay = v),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.flag_outlined),
              title: const Text('开始'),
              subtitle: Text(_allDay ? md(_start) : hhmm(_start)),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickStart,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.flag),
              title: const Text('结束'),
              subtitle: Text(_allDay ? md(_end) : hhmm(_end)),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickEnd,
            ),
            TextField(
              controller: _location,
              decoration: const InputDecoration(labelText: '地点（可选）', border: OutlineInputBorder()),
              maxLength: 200,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: '备注（可选）', border: OutlineInputBorder()),
              maxLines: 3,
              maxLength: 2000,
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(widget.event == null ? '创建' : '保存'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      _snack('请输入日程标题');
      return;
    }
    final startDay = DateTime(_start.year, _start.month, _start.day);
    final endDay = DateTime(_end.year, _end.month, _end.day);
    if (_allDay) {
      if (endDay.isBefore(startDay)) {
        _snack('结束时间必须晚于开始时间');
        return;
      }
    } else if (!_end.isAfter(_start)) {
      _snack('结束时间必须晚于开始时间');
      return;
    }
    // 全天：存日期 00:00 / 23:59:59（对齐 Web）。
    final startAt = _allDay ? startDay : _start;
    final endAt = _allDay ? DateTime(endDay.year, endDay.month, endDay.day, 23, 59, 59) : _end;
    final actions = ref.read(eventActionsProvider);
    setState(() => _submitting = true);
    try {
      if (widget.event == null) {
        await actions.create(
          title: title,
          startAt: startAt,
          endAt: endAt,
          isAllDay: _allDay,
          location: _location.text.trim(),
          note: _note.text.trim(),
        );
      } else {
        await actions.update(
          widget.event!.id,
          title: title,
          startAt: startAt,
          endAt: endAt,
          isAllDay: _allDay,
          location: _location.text.trim(),
          note: _note.text.trim(),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(humanizeError(e));
    }
  }
}
