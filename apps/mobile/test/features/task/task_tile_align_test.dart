import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/task/task_models.dart';
import 'package:serenique_mobile/features/task/widgets/task_tile.dart';

void main() {
  TaskEntry entry({
    String groupTitle = '工作',
    String? dueDate = '2026-08-09',
    String status = 'todo',
  }) {
    return TaskEntry(
      id: 't1',
      groupId: 'g1',
      title: '写周报',
      status: status,
      createdAt: '2026-08-09T00:00:00Z',
      updatedAt: '2026-08-09T00:00:00Z',
      dueDate: dueDate,
    );
  }

  Future<void> pump(WidgetTester tester, TaskTile tile) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: tile)));
  }

  /// 勾选图标中心必须与整条 tile 的竖直中心重合（= 内容块中心）。
  void expectCentered(WidgetTester tester) {
    final iconCenter = tester.getCenter(find.byIcon(Icons.radio_button_unchecked));
    final tileCenter = tester.getCenter(find.byType(TaskTile));
    expect((iconCenter.dy - tileCenter.dy).abs(), lessThan(1.0),
        reason: '勾选图标中心应与内容块竖直中心在同一水平线');
  }

  testWidgets('icon centered on content block — with subtitle (date views)', (tester) async {
    await pump(tester, TaskTile(task: entry(), groupTitle: '工作', onToggle: () {}));
    expectCentered(tester);
  });

  testWidgets('icon centered on content block — no subtitle (group detail)', (tester) async {
    await pump(tester, TaskTile(task: entry(groupTitle: '', dueDate: null), groupTitle: ''));
    expectCentered(tester);
  });

  testWidgets('icon centered on content block — done state', (tester) async {
    await pump(tester, TaskTile(task: entry(status: 'done'), groupTitle: '工作'));
    final iconCenter = tester.getCenter(find.byIcon(Icons.check_circle));
    final tileCenter = tester.getCenter(find.byType(TaskTile));
    expect((iconCenter.dy - tileCenter.dy).abs(), lessThan(1.0));
  });
}
