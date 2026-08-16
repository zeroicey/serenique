import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/habit/habit_time.dart';

void main() {
  group('日期工具', () {
    test('todayKey 为 YYYY-MM-DD', () {
      final k = habitTodayKey();
      expect(RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(k), isTrue);
    });

    test('shiftDay 前后移动', () {
      expect(habitShiftDay('2026-08-16', -1), '2026-08-15');
      expect(habitShiftDay('2026-08-16', 1), '2026-08-17');
      expect(habitShiftDay('2026-08-01', -1), '2026-07-31');
      expect(habitShiftDay('2026-12-31', 1), '2027-01-01');
    });

    test('dateLabel 中文格式', () {
      expect(habitDateLabel('2026-08-16'), contains('8月16日'));
    });

    test('monthDay 短格式', () {
      expect(habitMonthDay('2026-08-05'), '8月5日');
    });
  });
}
