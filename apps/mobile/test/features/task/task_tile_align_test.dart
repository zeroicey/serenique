import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/task/task_models.dart';
import 'package:serenique_mobile/features/task/widgets/task_tile.dart';

void main() {
  testWidgets('toggle icon center aligns with title first line center', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TaskTile(
          task: TaskEntry(
            id: 't1',
            groupId: 'g1',
            title: '写周报',
            status: 'todo',
            createdAt: '2026-08-09T00:00:00Z',
            updatedAt: '2026-08-09T00:00:00Z',
            dueDate: '2026-08-09',
          ),
          groupTitle: '工作',
          onToggle: () {},
        ),
      ),
    ));

    final iconCenter = tester.getCenter(find.byIcon(Icons.radio_button_unchecked));
    final titleCenter = tester.getCenter(find.text('写周报'));
    expect((titleCenter.dy - iconCenter.dy).abs(), lessThan(1.0),
        reason: '勾选图标中心应与标题首行中心在同一水平线');
  });

  testWidgets('alignment holds with empty group title (no subtitle)', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TaskTile(
          task: TaskEntry(
            id: 't1',
            groupId: 'g1',
            title: '写周报',
            status: 'todo',
            createdAt: '2026-08-09T00:00:00Z',
            updatedAt: '2026-08-09T00:00:00Z',
          ),
          groupTitle: '',
        ),
      ),
    ));

    final iconCenter = tester.getCenter(find.byIcon(Icons.radio_button_unchecked));
    final titleCenter = tester.getCenter(find.text('写周报'));
    expect((titleCenter.dy - iconCenter.dy).abs(), lessThan(1.0),
        reason: '无副标题时勾选图标与标题也应同线');
  });
}
