// 习惯行：做没做型 → ✓做了 / ✗没做 三态；计数型 → ×N + ±1。
// 名称下方显示习惯简介（habits.description）；长按弹出菜单：编辑 / 删除。
// 交互不做乐观更新（点击 → 服务端 → invalidate 刷新），个人应用网络延迟可接受。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_exception.dart';
import '../habit_models.dart';
import '../habit_providers.dart';

class HabitTile extends ConsumerWidget {
  const HabitTile({
    super.key,
    required this.habit,
    required this.daily,
    required this.date,
    required this.onEdit,
    required this.onDelete,
  });

  final Habit habit;

  /// 当天该习惯的状态；null = 未记录。
  final HabitDaily? daily;
  final String date;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = ref.read(habitActionsProvider);
    final count = daily?.count ?? 0;
    final status = daily?.status;
    final description = habit.description;

    Future<void> run(Future<void> Function() fn) async {
      try {
        await fn();
      } catch (err) {
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(humanizeError(err))));
        }
      }
    }

    void toggleStatus(String next) {
      run(
        () => status == next
            ? actions.clearDaily(habitId: habit.id, date: date)
            : actions.setStatus(habitId: habit.id, date: date, status: next),
      );
    }

    void increment() => run(
      () => actions.setCount(habitId: habit.id, date: date, count: count + 1),
    );

    void decrement() => run(
      () => count <= 1
          ? actions.clearDaily(habitId: habit.id, date: date)
          : actions.setCount(habitId: habit.id, date: date, count: count - 1),
    );

    final color = habit.isGood ? Colors.green : Colors.redAccent;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      title: Text(
        habit.name,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      ),
      subtitle: description == null || description.isEmpty
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ),
      trailing: habit.countable
          ? _countControls(count, decrement, increment, onEdit, onDelete)
          : _statusControls(status, toggleStatus, onEdit, onDelete),
      onLongPress: () => _showMenu(context, onEdit, onDelete),
    );
  }

  Widget _statusControls(
    String? status,
    void Function(String next) toggleStatus,
    VoidCallback onEdit,
    VoidCallback onDelete,
  ) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _stateButton(
          status == 'done',
          '做了',
          Colors.green,
          () => toggleStatus('done'),
        ),
        const SizedBox(width: 4),
        _stateButton(
          status == 'not_done',
          '没做',
          Colors.redAccent,
          () => toggleStatus('not_done'),
        ),
      ],
    );
  }

  Widget _countControls(
    int count,
    VoidCallback decrement,
    VoidCallback increment,
    VoidCallback onEdit,
    VoidCallback onDelete,
  ) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          icon: const Icon(Icons.remove_circle_outline, size: 20),
          tooltip: '减一次',
          visualDensity: VisualDensity.compact,
          onPressed: count == 0 ? null : decrement,
        ),
        Text(
          '×$count',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        IconButton(
          icon: const Icon(Icons.add_circle_outline, size: 20),
          tooltip: '加一次',
          visualDensity: VisualDensity.compact,
          onPressed: increment,
        ),
      ],
    );
  }

  Widget _stateButton(
    bool active,
    String label,
    Color color,
    VoidCallback onTap,
  ) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: active ? color.withValues(alpha: 0.15) : Colors.transparent,
          border: Border.all(
            color: active ? color : Colors.grey.shade400,
            width: 1,
          ),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: active ? color : Colors.grey.shade600,
            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  void _showMenu(
    BuildContext context,
    VoidCallback onEdit,
    VoidCallback onDelete,
  ) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('编辑习惯'),
              onTap: () {
                Navigator.pop(ctx);
                onEdit();
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline,
                color: Colors.redAccent,
              ),
              title: const Text(
                '删除习惯',
                style: TextStyle(color: Colors.redAccent),
              ),
              onTap: () {
                Navigator.pop(ctx);
                onDelete();
              },
            ),
          ],
        ),
      ),
    );
  }
}
