// 习惯新建/编辑合一全屏页。[habit] 非空 = 编辑。
// 字段：名称 + 好坏标签 + 计数型开关 + 排序号。由 /habit/edit 路由承载（ShellRoute 外）。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../habit_models.dart';
import '../habit_providers.dart';

class HabitEditArgs {
  const HabitEditArgs({this.habit});

  final Habit? habit; // 编辑时回填
}

class HabitEditPage extends ConsumerStatefulWidget {
  const HabitEditPage({super.key, required this.args});

  final HabitEditArgs args;

  @override
  ConsumerState<HabitEditPage> createState() => _HabitEditPageState();
}

class _HabitEditPageState extends ConsumerState<HabitEditPage> {
  late final TextEditingController _name = TextEditingController(
    text: widget.args.habit?.name ?? '',
  );
  late final TextEditingController _sortOrder = TextEditingController(
    text: '${widget.args.habit?.sortOrder ?? 0}',
  );
  String _kind = 'good';
  bool _countable = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final h = widget.args.habit;
    _kind = h?.kind ?? 'good';
    _countable = h?.countable ?? false;
  }

  @override
  void dispose() {
    _name.dispose();
    _sortOrder.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.args.habit != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? '编辑习惯' : '新建习惯')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _name,
              decoration: const InputDecoration(
                labelText: '名称',
                border: OutlineInputBorder(),
              ),
              maxLength: 100,
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: const InputDecoration(labelText: '好坏标签'),
              items: const [
                DropdownMenuItem(value: 'good', child: Text('好事（绿色）')),
                DropdownMenuItem(value: 'bad', child: Text('坏事（红色）')),
              ],
              onChanged: (v) => setState(() => _kind = v ?? 'good'),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('计数型（一天多次）'),
              subtitle: const Text('如喝水/吃药：点一下 +1 记次数；关 = 做没做型（跑步/熬夜）'),
              value: _countable,
              onChanged: (v) => setState(() => _countable = v),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _sortOrder,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '排序号（越小越靠前）',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(editing ? '保存' : '创建'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('请输入习惯名称')));
      return;
    }
    final sortOrder = int.tryParse(_sortOrder.text.trim());
    if (sortOrder == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('排序号须为整数')));
      return;
    }
    final actions = ref.read(habitActionsProvider);
    setState(() => _submitting = true);
    try {
      if (widget.args.habit == null) {
        await actions.create(name: name, kind: _kind, countable: _countable);
      } else {
        await actions.update(
          widget.args.habit!.id,
          name: name,
          kind: _kind,
          countable: _countable,
          sortOrder: sortOrder,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (err) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(humanizeError(err))));
    }
  }
}
