import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/event/widgets/event_tile.dart';

EventEntry entry({
  required String title,
  bool isAllDay = false,
  String? location,
  String? note,
  int startHour = 9,
}) =>
    EventEntry(
      id: 'e1',
      title: title,
      startAt: withOffset(DateTime(2026, 8, 5, startHour, 0)),
      endAt: withOffset(DateTime(2026, 8, 5, startHour + 1, 0)),
      isAllDay: isAllDay,
      location: location,
      note: note,
      createdAt: 't',
      updatedAt: 't',
    );

void main() {
  testWidgets('全天徽标：isAllDay 显示「全天」而非时间', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(event: entry(title: '出差', isAllDay: true), onEdit: () {}, onDelete: () {}),
      ),
    ));
    expect(find.text('全天'), findsOneWidget);
    expect(find.textContaining('–'), findsNothing);
  });

  testWidgets('时段事件：显示 HH:mm – HH:mm', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(event: entry(title: '晨会', startHour: 9), onEdit: () {}, onDelete: () {}),
      ),
    ));
    expect(find.text('09:00 – 10:00'), findsOneWidget);
    expect(find.text('晨会'), findsOneWidget);
  });

  testWidgets('地点展示；长备注截断后可展开/收起', (tester) async {
    final longNote = '备注' * 100; // 200 字 > 150
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(
          event: entry(title: 'x', location: '会议室', note: longNote),
          onEdit: () {},
          onDelete: () {},
        ),
      ),
    ));
    expect(find.text('会议室'), findsOneWidget);
    expect(find.text('展开'), findsOneWidget);
    expect(find.textContaining('…'), findsOneWidget);

    await tester.tap(find.text('展开'));
    await tester.pumpAndSettle();
    expect(find.text('收起'), findsOneWidget);
    expect(find.textContaining('备注'), findsWidgets);
  });

  testWidgets('⋯ 菜单：编辑触发 onEdit、删除触发 onDelete', (tester) async {
    var edited = false;
    var deleted = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: EventTile(
          event: entry(title: 'x'),
          onEdit: () => edited = true,
          onDelete: () => deleted = true,
        ),
      ),
    ));
    await tester.tap(find.byTooltip('日程操作'));
    await tester.pumpAndSettle();
    expect(find.text('编辑'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);

    await tester.tap(find.text('编辑'));
    await tester.pumpAndSettle();
    expect(edited, isTrue);

    await tester.tap(find.byTooltip('日程操作'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();
    expect(deleted, isTrue);
  });
}
