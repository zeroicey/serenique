import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';
import 'package:serenique_mobile/features/ai/widgets/tool_card.dart';

void main() {
  testWidgets('运行中：默认只显示头部（工具名+转圈），参数/结果收起', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1', name: 'list_tasks', args: {'groupId': 'g1'}, result: '{}', isError: false, running: true),
        ),
      ),
    ));
    expect(find.text('list_tasks'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('参数'), findsNothing);
    expect(find.text('结果'), findsNothing);
  });

  testWidgets('完成：默认只显示头部；点击头部一次展开全部参数与结果', (tester) async {
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
    expect(find.text('参数'), findsNothing);
    expect(find.text('结果'), findsNothing);

    // 点头部（工具名）→ 一次展开显示全部
    await tester.tap(find.text('create_task'));
    await tester.pumpAndSettle();
    expect(find.text('参数'), findsOneWidget);
    expect(find.text('结果'), findsOneWidget);
    expect(find.textContaining('买牛奶'), findsOneWidget);
    expect(find.text('已创建'), findsOneWidget);
  });

  testWidgets('失败：头部显示 error 图标；展开后结果红显', (tester) async {
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
    await tester.tap(find.text('delete_task'));
    await tester.pumpAndSettle();
    expect(find.text('删除失败'), findsOneWidget);
  });
}
