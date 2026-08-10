import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';

void main() {
  test('fromJson 全字段', () {
    final e = EventEntry.fromJson({
      'id': 'e1',
      'title': '晨会',
      'startAt': '2026-08-05T09:00:00+08:00',
      'endAt': '2026-08-05T10:00:00+08:00',
      'isAllDay': false,
      'location': '会议室',
      'note': '带笔',
      'createdAt': 't1',
      'updatedAt': 't2',
    });
    expect(e.title, '晨会');
    expect(e.location, '会议室');
    expect(e.isAllDay, isFalse);
  });

  test('fromJson 缺字段回退默认值', () {
    final e = EventEntry.fromJson({
      'id': 'e2',
      'title': '全天',
      'startAt': '2026-08-05T00:00:00+08:00',
      'endAt': '2026-08-05T23:59:59+08:00',
      'createdAt': 't1',
      'updatedAt': 't2',
    });
    expect(e.isAllDay, isFalse); // 默认 false
    expect(e.location, isNull);
    expect(e.note, isNull);
  });
}
