// 习惯（Habit）模块纯日期工具：全部基于设备本地时区，日期键 = YYYY-MM-DD。
// 与 event_time.dart 同款约定，独立成文件避免跨模块依赖。

String habitDayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime habitDayFromKey(String key) {
  final p = key.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

String habitTodayKey() => habitDayKey(DateTime.now());

String habitShiftDay(String key, int n) {
  final d = habitDayFromKey(key);
  return habitDayKey(DateTime(d.year, d.month, d.day + n));
}

String habitMonthDay(String key) {
  final p = key.split('-');
  return '${int.parse(p[1])}月${int.parse(p[2])}日';
}

/// 「8月16日 周六」样式。
String habitDateLabel(String key) {
  final d = habitDayFromKey(key);
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return '${habitMonthDay(key)} ${weekdays[d.weekday - 1]}';
}
