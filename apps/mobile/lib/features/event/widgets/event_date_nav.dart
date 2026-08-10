// 日期导航栏：◀ 日期（点开月历） 今天 ▶。
import 'package:flutter/material.dart';
import '../event_time.dart';

class EventDateNav extends StatelessWidget {
  const EventDateNav({
    super.key,
    required this.selectedDay,
    required this.onChanged,
    required this.onPickDate,
  });

  final String selectedDay;
  final ValueChanged<String> onChanged;
  final VoidCallback onPickDate;

  @override
  Widget build(BuildContext context) {
    final isToday = selectedDay == todayKey();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: '前一天',
            onPressed: () => onChanged(shiftDay(selectedDay, -1)),
          ),
          Expanded(
            child: InkWell(
              onTap: onPickDate,
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
            onPressed: isToday ? null : () => onChanged(todayKey()),
            child: const Text('今天'),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: '后一天',
            onPressed: () => onChanged(shiftDay(selectedDay, 1)),
          ),
        ],
      ),
    );
  }
}
