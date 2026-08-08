import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/moment/moment_models.dart';

void main() {
  test('Moment.fromJson 解析字段 + 内嵌评论', () {
    final m = Moment.fromJson({
      'id': 'm1',
      'text': '今天天气不错',
      'attachments': <Object>[],
      'comments': [
        {'id': 'c1', 'momentId': 'm1', 'content': '同意', 'createdAt': 't', 'updatedAt': 't'},
      ],
      'commentCount': 1,
      'createdAt': 't',
      'updatedAt': 't',
    });
    expect(m.id, 'm1');
    expect(m.text, '今天天气不错');
    expect(m.comments.single.content, '同意');
    expect(m.commentCount, 1);
  });

  test('Moment.fromJson 缺 comments 时默认为空', () {
    final m = Moment.fromJson({'id': 'm2', 'text': 'x', 'createdAt': 't', 'updatedAt': 't'});
    expect(m.comments, isEmpty);
    expect(m.commentCount, 0);
  });
}
