// AppBar 标题区日期导航：◀ 日期 今天 ▶。
// 自读 habitSelectedDayProvider，与 HabitPage 列表共享选中日；紧凑布局适配 AppBar。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../habit_providers.dart';
import '../habit_time.dart';

class HabitDateNav extends ConsumerWidget {
  const HabitDateNav({super.key});

  void _select(WidgetRef ref, String day) =>
      ref.read(habitSelectedDayProvider.notifier).select(day);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedDay = ref.watch(habitSelectedDayProvider);
    final isToday = selectedDay == habitTodayKey();
    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.chevron_left),
          visualDensity: VisualDensity.compact,
          tooltip: '前一天',
          onPressed: () => _select(ref, habitShiftDay(selectedDay, -1)),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              habitDateLabel(selectedDay),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        TextButton(
          onPressed: isToday ? null : () => _select(ref, habitTodayKey()),
          child: const Text('今天'),
        ),
        IconButton(
          icon: const Icon(Icons.chevron_right),
          visualDensity: VisualDensity.compact,
          tooltip: '后一天',
          onPressed: () => _select(ref, habitShiftDay(selectedDay, 1)),
        ),
      ],
    );
  }
}
