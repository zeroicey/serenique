/// 把后端 ISO 时间转成「朋友圈」风格的相对时间。
/// 当天 → HH:mm；昨天 → 昨天 HH:mm；同年 → M月d日；更早 → yyyy年M月d日。
///
/// `now` 仅用于测试注入，默认取当前时间。
String formatMomentTime(String iso, {DateTime? now}) {
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return iso;
  final ref = now ?? DateTime.now();
  final today = DateTime(ref.year, ref.month, ref.day);
  final day = DateTime(dt.year, dt.month, dt.day);
  final days = today.difference(day).inDays;
  final hhmm =
      '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  if (days == 0) return hhmm;
  if (days == 1) return '昨天 $hhmm';
  if (dt.year == ref.year) return '${dt.month}月${dt.day}日';
  return '${dt.year}年${dt.month}月${dt.day}日';
}
