/// 纯日期工具：全部基于设备本地时区，输出 YYYY-MM-DD 字符串（与 API 的
/// dueDate 契约一致，字符串可直接字典序比较）。
String dateStr(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String todayStr() => dateStr(DateTime.now());

DateTime mondayOf(DateTime d) =>
    DateTime(d.year, d.month, d.day - (d.weekday - 1)); // weekday: 1=Mon..7=Sun

/// 本周 [周一, 周日] 的 YYYY-MM-DD 字符串对。
(String, String) weekRange([DateTime? now]) {
  final monday = mondayOf(now ?? DateTime.now());
  final sunday = DateTime(monday.year, monday.month, monday.day + 6);
  return (dateStr(monday), dateStr(sunday));
}

/// 本月 [1号, 月末] 的 YYYY-MM-DD 字符串对。
(String, String) monthRange([DateTime? now]) {
  final d = now ?? DateTime.now();
  final first = DateTime(d.year, d.month, 1);
  final last = DateTime(d.year, d.month + 1, 0); // 下月第 0 天 = 本月末
  return (dateStr(first), dateStr(last));
}

/// dueDate 的展示标签：今天 / 明天 / M月d日。today 可注入便于测试。
String dueDateLabel(String dueDate, {DateTime? today}) {
  final t = today ?? DateTime.now();
  final d = DateTime.parse(dueDate);
  final diff = DateTime(d.year, d.month, d.day).difference(DateTime(t.year, t.month, t.day)).inDays;
  if (diff == 0) return '今天';
  if (diff == 1) return '明天';
  return '${d.month}月${d.day}日';
}
