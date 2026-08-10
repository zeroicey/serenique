// 自绘月历弹窗：单日跳转入口。带日程圆点、今天/选中态、‹›与横滑切月。
// 周一开头；相邻月灰色数字可点（直接跳到该日）。点选日期 → pop(dayKey)。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../event_models.dart';
import '../event_providers.dart';
import '../event_time.dart';

Future<String?> showMonthCalendarSheet(BuildContext context, {required String initialDay}) {
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (_) => MonthCalendarSheet(initialDay: initialDay),
  );
}

class MonthCalendarSheet extends ConsumerStatefulWidget {
  const MonthCalendarSheet({super.key, required this.initialDay});

  final String initialDay;

  @override
  ConsumerState<MonthCalendarSheet> createState() => _MonthCalendarSheetState();
}

class _MonthCalendarSheetState extends ConsumerState<MonthCalendarSheet> {
  static const _weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

  late DateTime _month; // 显示月份（该月 1 号）
  late String _selectedDay;

  @override
  void initState() {
    super.initState();
    final d = dayFromKey(widget.initialDay);
    _month = DateTime(d.year, d.month, 1);
    _selectedDay = widget.initialDay;
  }

  void _shiftMonth(int delta) {
    setState(() => _month = DateTime(_month.year, _month.month + delta, 1));
  }

  void _goToday() => Navigator.of(context).pop(todayKey());

  void _select(DateTime day) => Navigator.of(context).pop(dayKey(day));

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final events =
        ref.watch(eventsInMonthProvider(monthKey(_month))).value ?? const <EventEntry>[];
    final dots = eventDayKeysInMonth(events, monthKey(_month));
    final today = todayKey();
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final leading = DateTime(_month.year, _month.month, 1).weekday - 1; // 周一开头

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              IconButton(
                  icon: const Icon(Icons.chevron_left), onPressed: () => _shiftMonth(-1)),
              Expanded(
                child: Center(
                  child: Text('${_month.year}年${_month.month}月',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ),
              ),
              TextButton(onPressed: _goToday, child: const Text('今天')),
              IconButton(
                  icon: const Icon(Icons.chevron_right), onPressed: () => _shiftMonth(1)),
            ]),
            Row(
              children: [
                for (final w in _weekdayLabels)
                  Expanded(
                    child: Center(
                      child: Text(w,
                          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            GestureDetector(
              onHorizontalDragEnd: (details) {
                final v = details.primaryVelocity ?? 0;
                if (v < -100) _shiftMonth(1);
                if (v > 100) _shiftMonth(-1);
              },
              child: GridView.count(
                crossAxisCount: 7,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (var i = 0; i < 42; i++) // 固定 6 行，高度稳定
                    _cell(i - leading + 1, daysInMonth, today, dots, scheme),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cell(int dayNumber, int daysInMonth, String today, Set<String> dots, ColorScheme scheme) {
    final day = DateTime(_month.year, _month.month, dayNumber); // Dart 自动归一化越界日
    final key = dayKey(day);
    final inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    final isToday = key == today;
    final isSelected = key == _selectedDay;
    final hasEvents = dots.contains(key);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => _select(day),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isToday
                  ? scheme.primary
                  : isSelected
                      ? scheme.primaryContainer
                      : null,
            ),
            child: Text(
              '${day.day}',
              style: TextStyle(
                fontSize: 14,
                color: inMonth
                    ? (isToday ? scheme.onPrimary : scheme.onSurface)
                    : scheme.outlineVariant,
                fontWeight: isToday || isSelected ? FontWeight.w600 : null,
              ),
            ),
          ),
          SizedBox(
            height: 4,
            child: hasEvents
                ? Center(
                    child: Container(
                      key: ValueKey('dot-$key'),
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: scheme.primary),
                    ),
                  )
                : null,
          ),
        ],
      ),
    );
  }
}
