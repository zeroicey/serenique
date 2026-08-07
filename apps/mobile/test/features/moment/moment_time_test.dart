import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_time.dart';

void main() {
  final now = DateTime(2026, 8, 7, 20, 0);

  test('当天 → HH:mm', () {
    expect(formatMomentTime('2026-08-07T20:05:00.000', now: now), '20:05');
  });

  test('昨天 → 昨天 HH:mm', () {
    expect(formatMomentTime('2026-08-06T23:59:00.000', now: now), '昨天 23:59');
  });

  test('同年更早 → M月d日', () {
    expect(formatMomentTime('2026-08-01T08:00:00.000', now: now), '8月1日');
  });

  test('跨年 → yyyy年M月d日', () {
    expect(formatMomentTime('2025-12-31T08:00:00.000', now: now), '2025年12月31日');
  });

  test('无法解析的字符串原样返回', () {
    expect(formatMomentTime('not-a-date', now: now), 'not-a-date');
  });
}
