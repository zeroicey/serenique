import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';
import 'package:serenique_mobile/features/ai/widgets/tool_card.dart';

void main() {
  testWidgets('运行中：显示工具名与转圈', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1', name: 'list_tasks', args: {}, result: '', isError: false, running: true),
        ),
      ),
    ));
    expect(find.text('list_tasks'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('完成：显示勾与结果；展开可看参数', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1',
              name: 'create_task',
              args: {'title': '买牛奶'},
              result: '已创建',
              isError: false,
              running: false),
        ),
      ),
    ));
    expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
    await tester.tap(find.text('参数'));
    await tester.pumpAndSettle();
    expect(find.textContaining('买牛奶'), findsOneWidget);
  });

  testWidgets('失败：结果区红显 error 图标', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1',
              name: 'delete_task',
              args: {'id': 'x'},
              result: '删除失败',
              isError: true,
              running: false),
        ),
      ),
    ));
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });
}
