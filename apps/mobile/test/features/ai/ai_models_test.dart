import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';

void main() {
  test('RenderMessage.fromJson：字段对齐 + toolCalls 过滤坏条目', () {
    final m = RenderMessage.fromJson({
      'role': 'assistant',
      'text': '完成',
      'thinking': '先查任务',
      'toolCalls': [
        {'id': 't1', 'name': 'list_tasks', 'args': {}, 'result': '[]', 'isError': false},
        'junk',
      ],
    });
    expect(m.role, 'assistant');
    expect(m.text, '完成');
    expect(m.thinking, '先查任务');
    expect(m.toolCalls.length, 1);
    expect(m.toolCalls.single.name, 'list_tasks');
  });

  test('RenderMessage.fromJson：缺字段回退默认值', () {
    final m = RenderMessage.fromJson({'role': 'user'});
    expect(m.text, '');
    expect(m.thinking, '');
    expect(m.toolCalls, isEmpty);
  });

  test('SessionItem.fromJson', () {
    final s = SessionItem.fromJson(
        {'id': 's1', 'name': '今日', 'messageCount': 2, 'modified': '2026-08-10T00:00:00Z'});
    expect(s.name, '今日');
    expect(s.messageCount, 2);
  });

  test('TurnState：isEmpty 与 close', () {
    final t = TurnState(1);
    expect(t.isEmpty, isTrue);
    t.text = 'x';
    expect(t.isEmpty, isFalse);
    t.close();
  });
}
