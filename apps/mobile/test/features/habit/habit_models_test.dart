import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/habit/habit_models.dart';

void main() {
  group('Habit.fromJson', () {
    test('解析完整字段（做没做型）', () {
      final h = Habit.fromJson(const {
        'id': 'h1',
        'name': '跑步',
        'kind': 'good',
        'countable': false,
        'sortOrder': 0,
        'createdAt': 't1',
        'updatedAt': 't2',
      });
      expect(h.id, 'h1');
      expect(h.name, '跑步');
      expect(h.kind, 'good');
      expect(h.isGood, isTrue);
      expect(h.countable, isFalse);
      expect(h.sortOrder, 0);
    });

    test('countable 缺省回退 false（坏习惯 red）', () {
      final h = Habit.fromJson(const {
        'id': 'h2',
        'name': '熬夜',
        'kind': 'bad',
        'createdAt': 't1',
        'updatedAt': 't2',
      });
      expect(h.countable, isFalse);
      expect(h.isGood, isFalse);
    });
  });

  group('HabitDaily.fromJson', () {
    test('做没做型：status done + count 0', () {
      final d = HabitDaily.fromJson(const {
        'habitId': 'h1',
        'status': 'done',
        'count': 0,
        'note': '5km',
      });
      expect(d.habitId, 'h1');
      expect(d.isDone, isTrue);
      expect(d.isNotDone, isFalse);
      expect(d.count, 0);
      expect(d.note, '5km');
    });

    test('未记录：status null + count 0 + note null', () {
      final d = HabitDaily.fromJson(const {
        'habitId': 'h1',
        'status': null,
        'count': 0,
        'note': null,
      });
      expect(d.status, isNull);
      expect(d.isDone, isFalse);
      expect(d.note, isNull);
    });

    test('计数型：count 3（status 恒 null）', () {
      final d = HabitDaily.fromJson(const {
        'habitId': 'h2',
        'status': null,
        'count': 3,
        'note': null,
      });
      expect(d.count, 3);
      expect(d.isDone, isFalse);
    });
  });

  group('HabitOverview.fromJson', () {
    test('解析 byDate（name 内联字段）+ stats', () {
      final ov = HabitOverview.fromJson(const {
        'days': 30,
        'fromDate': '2026-07-18',
        'toDate': '2026-08-16',
        'byDate': {
          '2026-08-16': [
            {
              'habitId': 'h1',
              'name': '跑步',
              'kind': 'good',
              'countable': false,
              'status': 'done',
              'count': 0,
              'note': '5km',
            },
            {
              'habitId': 'h2',
              'name': '喝水',
              'kind': 'good',
              'countable': true,
              'status': null,
              'count': 4,
              'note': null,
            },
          ],
        },
        'stats': [
          {
            'habitId': 'h1',
            'name': '跑步',
            'kind': 'good',
            'countable': false,
            'doneDays': 5,
            'notDoneDays': 2,
            'totalCount': 0,
          },
          {
            'habitId': 'h2',
            'name': '喝水',
            'kind': 'good',
            'countable': true,
            'doneDays': 7,
            'notDoneDays': 0,
            'totalCount': 30,
          },
        ],
      });

      expect(ov.days, 30);
      final records = ov.byDate['2026-08-16']!;
      expect(records.length, 2);
      expect(records[0].name, '跑步');
      expect(records[0].kind, 'good');
      expect(records[0].status, 'done');
      expect(records[0].note, '5km');
      expect(records[1].name, '喝水');
      expect(records[1].countable, isTrue);
      expect(records[1].count, 4);

      expect(ov.stats.length, 2);
      final run = ov.stats[0];
      expect(run.doneDays, 5);
      expect(run.notDoneDays, 2);
      expect(ov.stats[1].totalCount, 30);
    });

    test('dayListDescending 按日期倒序', () {
      final ov = HabitOverview.fromJson(const {
        'days': 30,
        'fromDate': '2026-07-18',
        'toDate': '2026-08-16',
        'byDate': {'2026-08-14': [], '2026-08-16': [], '2026-08-15': []},
        'stats': [],
      });
      expect(ov.dayListDescending.map((e) => e.key).toList(), [
        '2026-08-16',
        '2026-08-15',
        '2026-08-14',
      ]);
    });
  });
}
