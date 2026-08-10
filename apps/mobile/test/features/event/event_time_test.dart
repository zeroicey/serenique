import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_time.dart';

EventEntry entry(String startAt, String endAt, {bool isAllDay = false}) =>
    EventEntry(
      id: 'x', title: 'x', startAt: startAt, endAt: endAt,
      isAllDay: isAllDay, createdAt: 't', updatedAt: 't',
    );

void main() {
  group('withOffset：补本地偏移', () {
    test('格式带 ±hh:mm', () {
      final t = DateTime(2026, 8, 5, 10, 30);
      final s = withOffset(t);
      final offset = t.timeZoneOffset;
      final sign = offset.isNegative ? '-' : '+';
      final h = offset.inHours.abs().toString().padLeft(2, '0');
      final m = (offset.inMinutes.abs() % 60).toString().padLeft(2, '0');
      expect(s, '2026-08-05T10:30:00.000$sign$h:$m');
    });
  });

  group('dayKey / monthKey / dayFromKey 往返', () {
    test('dayKey 往返', () {
      final d = DateTime(2026, 8, 12);
      expect(dayFromKey(dayKey(d)), d);
    });
    test('monthKey', () {
      expect(monthKey(DateTime(2026, 8, 12)), '2026-08');
      expect(monthKey(DateTime(2026, 12, 1)), '2026-12');
    });
  });

  group('dayWindow / monthWindow 本地日界', () {
    test('dayWindow [00:00, 次日 00:00)', () {
      final (from, to) = dayWindow('2026-08-12');
      expect(DateTime.parse(from).toLocal(), DateTime(2026, 8, 12));
      expect(DateTime.parse(to).toLocal(), DateTime(2026, 8, 13));
    });
    test('monthWindow [1号, 下月1号) 跨月', () {
      final (from, to) = monthWindow('2026-08');
      expect(DateTime.parse(from).toLocal(), DateTime(2026, 8, 1));
      expect(DateTime.parse(to).toLocal(), DateTime(2026, 9, 1));
    });
    test('monthWindow 12 月跨次年', () {
      final (_, to) = monthWindow('2026-12');
      expect(DateTime.parse(to).toLocal(), DateTime(2027, 1, 1));
    });
  });

  test('shiftDay 跨月边界', () {
    expect(shiftDay('2026-08-31', 1), '2026-09-01');
    expect(shiftDay('2026-08-01', -1), '2026-07-31');
    expect(shiftDay('2026-12-31', 1), '2027-01-01');
  });

  group('eventTimeLabel 三态', () {
    test('全天 → "全天"', () {
      expect(eventTimeLabel(entry('', '', isAllDay: true)), '全天');
    });
    test('同日时段 → "HH:mm – HH:mm"', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 5, 9, 0)),
        withOffset(DateTime(2026, 8, 5, 10, 30)),
      );
      expect(eventTimeLabel(e), '09:00 – 10:30');
    });
    test('跨日 → "M月d日 HH:mm – M月d日 HH:mm"', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 5, 23, 0)),
        withOffset(DateTime(2026, 8, 6, 1, 0)),
      );
      expect(eventTimeLabel(e), '8月5日 23:00 – 8月6日 01:00');
    });
  });

  group('sortEvents 按时刻升序', () {
    test('同日按时间', () {
      final a = entry(withOffset(DateTime(2026, 8, 5, 10, 0)), withOffset(DateTime(2026, 8, 5, 11, 0)));
      final b = entry(withOffset(DateTime(2026, 8, 5, 9, 0)), withOffset(DateTime(2026, 8, 5, 10, 0)));
      expect(sortEvents([a, b]).map((e) => e.startAt), [b.startAt, a.startAt]);
    });
  });

  group('eventDayKeysInMonth 圆点', () {
    test('单日事件标记该日', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 12, 9, 0)),
        withOffset(DateTime(2026, 8, 12, 10, 0)),
      );
      expect(eventDayKeysInMonth([e], '2026-08'), {'2026-08-12'});
    });
    test('跨日事件标记所有重叠日', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 12, 23, 0)),
        withOffset(DateTime(2026, 8, 14, 1, 0)),
      );
      expect(eventDayKeysInMonth([e], '2026-08'), {'2026-08-12', '2026-08-13', '2026-08-14'});
    });
    test('事件结束在当日 00:00 不标记该日（严格小于）', () {
      final e = entry(
        withOffset(DateTime(2026, 8, 11, 22, 0)),
        withOffset(DateTime(2026, 8, 12, 0, 0)),
      );
      final dots = eventDayKeysInMonth([e], '2026-08');
      expect(dots, contains('2026-08-11'));
      expect(dots, isNot(contains('2026-08-12')));
    });
    test('跨月边界：上月事件延伸到本月 1 号', () {
      final e = entry(
        withOffset(DateTime(2026, 7, 31, 23, 0)),
        withOffset(DateTime(2026, 8, 1, 1, 0)),
      );
      expect(eventDayKeysInMonth([e], '2026-08'), {'2026-08-01'});
    });
  });

  test('dateLabel 含星期', () {
    // 2026-08-12 是周三（2026-08-10 周一，可手动算）
    expect(dateLabel('2026-08-12'), '8月12日 周三');
    expect(dateLabel('2026-08-10'), '8月10日 周一');
    expect(dateLabel('2026-08-09'), '8月9日 周日');
  });
}
