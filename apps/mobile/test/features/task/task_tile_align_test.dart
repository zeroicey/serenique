import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/task/task_models.dart';
import 'package:serenique_mobile/features/task/widgets/task_tile.dart';

void main() {
  TaskEntry entry({
    String title = '写周报',
    String groupTitle = '工作',
    String? dueDate = '2026-08-09',
    String status = 'todo',
  }) {
    return TaskEntry(
      id: 't1',
      groupId: 'g1',
      title: title,
      status: status,
      createdAt: '2026-08-09T00:00:00Z',
      updatedAt: '2026-08-09T00:00:00Z',
      dueDate: dueDate,
    );
  }

  Future<void> pump(WidgetTester tester, TaskTile tile) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: tile)));
  }

  /// 勾选图标中心必须与标题「第一行」的竖直中心重合
  /// （长标题换行时勾选框固定在首行，不随内容块整体居中）。
  void expectAlignedWithFirstLine(WidgetTester tester, IconData icon) {
    final iconCenter = tester.getCenter(find.byIcon(icon));
    final titleFinder = find.byType(Text).first;
    final paragraph = tester.renderObject<RenderParagraph>(titleFinder);
    final firstLine = paragraph
        .getBoxesForSelection(const TextSelection(baseOffset: 0, extentOffset: 1))
        .first;
    final titleTopLeft = tester.getTopLeft(titleFinder);
    final firstLineCenter =
        titleTopLeft.dy + firstLine.top + (firstLine.bottom - firstLine.top) / 2;
    expect((iconCenter.dy - firstLineCenter).abs(), lessThan(1.0),
        reason: '勾选图标中心应与标题第一行在同一水平线');
  }

  /// 标题必须不省略号截断、不限行数，实际渲染高度超过单行（bodyLarge 行高 24）。
  void expectTitleWraps(WidgetTester tester) {
    final text = tester.widget<Text>(find.byType(Text).first);
    expect(text.maxLines, isNull, reason: '标题不应限制行数');
    expect(text.overflow, isNull, reason: '标题不应省略号截断');
    expect(tester.getSize(find.byType(Text).first).height, greaterThan(24.0),
        reason: '长标题应换行为多行显示');
  }

  testWidgets('icon aligned with first line — with subtitle (date views)', (tester) async {
    await pump(tester, TaskTile(task: entry(), groupTitle: '工作', onToggle: () {}));
    expectAlignedWithFirstLine(tester, Icons.radio_button_unchecked);
  });

  testWidgets('icon aligned with first line — no subtitle (group detail)', (tester) async {
    await pump(tester, TaskTile(task: entry(groupTitle: '', dueDate: null), groupTitle: ''));
    expectAlignedWithFirstLine(tester, Icons.radio_button_unchecked);
  });

  testWidgets('icon aligned with first line — done state', (tester) async {
    await pump(tester, TaskTile(task: entry(status: 'done'), groupTitle: '工作'));
    expectAlignedWithFirstLine(tester, Icons.check_circle);
  });

  testWidgets('long title wraps to multiple lines without ellipsis, icon stays on first line',
      (tester) async {
    const line = '非常非常长的任务标题，需要换行展示，不能省略也不能截断，';
    await pump(
      tester,
      TaskTile(task: entry(title: line * 8, groupTitle: '', dueDate: null), groupTitle: ''),
    );
    expectTitleWraps(tester);
    expectAlignedWithFirstLine(tester, Icons.radio_button_unchecked);
  });
}
