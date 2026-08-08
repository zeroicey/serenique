import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/task/task_time.dart';

void main() {
  test('dateStr pads month/day', () {
    expect(dateStr(DateTime(2026, 8, 9)), '2026-08-09');
    expect(dateStr(DateTime(2026, 12, 31)), '2026-12-31');
  });

  test('mondayOf rolls back to Monday', () {
    // 2026-08-09 is a Sunday → Monday is 08-03
    expect(dateStr(mondayOf(DateTime(2026, 8, 9))), '2026-08-03');
    // 2026-08-10 is a Monday → itself
    expect(dateStr(mondayOf(DateTime(2026, 8, 10))), '2026-08-10');
  });

  test('monthRange spans first to last day', () {
    final (from, to) = monthRange(DateTime(2026, 8, 15));
    expect(from, '2026-08-01');
    expect(to, '2026-08-31');
    final (f2, t2) = monthRange(DateTime(2026, 2, 1));
    expect(t2, '2026-02-28');
  });

  test('dueDateLabel distinguishes today/tomorrow/other', () {
    expect(dueDateLabel('2026-08-09', today: DateTime(2026, 8, 9)), '今天');
    expect(dueDateLabel('2026-08-10', today: DateTime(2026, 8, 9)), '明天');
    expect(dueDateLabel('2026-08-20', today: DateTime(2026, 8, 9)), '8月20日');
  });
}
