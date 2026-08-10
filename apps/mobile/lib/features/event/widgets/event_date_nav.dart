// AppBar 标题区日期导航：◀ 日期（点开月历） 今天 ▶。
// 自读 eventSelectedDayProvider，与 EventPage 列表共享选中日；紧凑布局适配 AppBar。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../event_providers.dart';
import '../event_time.dart';
import 'month_calendar_sheet.dart';

class EventDateNav extends ConsumerWidget {
  const EventDateNav({super.key});

  Future<void> _pickDate(BuildContext context, WidgetRef ref) async {
    final initial = ref.read(eventSelectedDayProvider);
    final day = await showMonthCalendarSheet(context, initialDay: initial);
    if (day != null) ref.read(eventSelectedDayProvider.notifier).select(day);
  }

  void _select(WidgetRef ref, String day) =>
      ref.read(eventSelectedDayProvider.notifier).select(day);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedDay = ref.watch(eventSelectedDayProvider);
    final isToday = selectedDay == todayKey();
    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.chevron_left),
          visualDensity: VisualDensity.compact,
          tooltip: '前一天',
          onPressed: () => _select(ref, shiftDay(selectedDay, -1)),
        ),
        Expanded(
          child: InkWell(
            onTap: () => _pickDate(context, ref),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text(
                dateLabel(selectedDay),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ),
        TextButton(
          onPressed: isToday ? null : () => _select(ref, todayKey()),
          child: const Text('今天'),
        ),
        IconButton(
          icon: const Icon(Icons.chevron_right),
          visualDensity: VisualDensity.compact,
          tooltip: '后一天',
          onPressed: () => _select(ref, shiftDay(selectedDay, 1)),
        ),
      ],
    );
  }
}
