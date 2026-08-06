import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/diary/diary_models.dart';

void main() {
  test('DiaryEntry.fromJson 解析', () {
    final e = DiaryEntry.fromJson({
      'id': 'd1',
      'diaryDate': '2026-08-06',
      'content': '今天写了第一篇日记',
      'createdAt': 't',
      'updatedAt': 't',
    });
    expect(e.id, 'd1');
    expect(e.diaryDate, '2026-08-06');
    expect(e.content, '今天写了第一篇日记');
  });
}
