// 纯日期工具：全部基于设备本地时区。日期键 = YYYY-MM-DD / YYYY-MM。
//
// 关键坑（已实测）：Dart 的 DateTime.parse 对带偏移 ISO（如
// "2026-08-05T10:00:00+08:00"）会归一化到 UTC（isUtc=true），
// 展示前必须先 .toLocal()。本文件所有「解析后端 ISO → 格式化」都遵守。
import 'event_models.dart';

String dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String monthKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';

/// 日期键 → 本地当天 00:00。
DateTime dayFromKey(String key) {
  final p = key.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

String todayKey() => dayKey(DateTime.now());

String shiftDay(String key, int n) {
  final d = dayFromKey(key);
  return dayKey(DateTime(d.year, d.month, d.day + n));
}

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String hhmm(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

String md(DateTime t) => '${t.month}月${t.day}日';

String dateLabel(String key) {
  final d = dayFromKey(key);
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return '${md(d)} ${weekdays[d.weekday - 1]}';
}

/// 后端要求 ISO 带时区偏移（offset: true）。本地 DateTime 的
/// toIso8601String 无偏移，手动补 ±hh:mm。
String withOffset(DateTime t) {
  final offset = t.timeZoneOffset;
  final sign = offset.isNegative ? '-' : '+';
  final h = offset.inHours.abs().toString().padLeft(2, '0');
  final m = (offset.inMinutes.abs() % 60).toString().padLeft(2, '0');
  return '${t.toIso8601String()}$sign$h:$m';
}

(String, String) dayWindow(String day) {
  final d = dayFromKey(day);
  return (withOffset(d), withOffset(DateTime(d.year, d.month, d.day + 1)));
}

(String, String) monthWindow(String month) {
  final p = month.split('-');
  final year = int.parse(p[0]);
  final m = int.parse(p[1]);
  return (withOffset(DateTime(year, m, 1)), withOffset(DateTime(year, m + 1, 1)));
}

/// 事件时间标签：全天 → '全天'；同日 → 'HH:mm – HH:mm'；
/// 跨日 → 'M月d日 HH:mm – M月d日 HH:mm'。
String eventTimeLabel(EventEntry e) {
  if (e.isAllDay) return '全天';
  final start = DateTime.parse(e.startAt).toLocal();
  final end = DateTime.parse(e.endAt).toLocal();
  return isSameDay(start, end)
      ? '${hhmm(start)} – ${hhmm(end)}'
      : '${md(start)} ${hhmm(start)} – ${md(end)} ${hhmm(end)}';
}

/// 按开始时刻升序（跨时区偏移用时刻比较）。
List<EventEntry> sortEvents(Iterable<EventEntry> events) {
  final list = events.toList();
  list.sort((a, b) => DateTime.parse(a.startAt).compareTo(DateTime.parse(b.startAt)));
  return list;
}

/// 月内每天是否有日程：返回有日程的日期键集合（月历圆点用）。
/// 重叠判定对齐后端：日 D 被覆盖 ⇔ start < D+1 00:00 且 end > D 00:00。
Set<String> eventDayKeysInMonth(Iterable<EventEntry> events, String month) {
  final days = <String>{};
  final (fromIso, _) = monthWindow(month);
  final monthStart = DateTime.parse(fromIso).toLocal();
  final monthEnd = DateTime(monthStart.year, monthStart.month + 1, 1);
  for (final e in events) {
    final start = DateTime.parse(e.startAt).toLocal();
    final end = DateTime.parse(e.endAt).toLocal();
    var d = monthStart;
    while (d.isBefore(monthEnd)) {
      final dayEnd = DateTime(d.year, d.month, d.day + 1);
      if (start.isBefore(dayEnd) && end.isAfter(d)) days.add(dayKey(d));
      d = dayEnd;
    }
  }
  return days;
}
