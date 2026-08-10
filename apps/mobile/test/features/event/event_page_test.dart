import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_page.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';

/// 按 dayKey 生成当日 09:00 的事件（标题带 dayKey，便于断言导航切换）。
EventEntry dayEvent(String day) => EventEntry(
      id: 'e-$day',
      title: '$day 的事件',
      startAt: withOffset(DateTime(2026, 8, 12, 9, 0)),
      endAt: withOffset(DateTime(2026, 8, 12, 10, 0)),
      isAllDay: false,
      createdAt: 't',
      updatedAt: 't',
    );

void main() {
  ProviderContainer container({List<EventEntry> events = const []}) => ProviderContainer(
        overrides: [
          // 按 dayKey 过滤：dayEvent 的 id 带 dayKey（'e-<day>'），否则切日列表不会变。
          eventsForDayProvider.overrideWith(
              (ref, day) async => events.where((e) => e.id == 'e-$day').toList()),
          eventsInMonthProvider.overrideWith((ref, month) async => const []),
          eventActionsProvider.overrideWith((ref) => EventActions(ref)),
        ],
      );

  Widget host(ProviderContainer c) => UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: EventPage()),
      );

  testWidgets('默认今天：渲染当日事件列表', (tester) async {
    final events = [dayEvent(todayKey())];
    final c = container(events: events);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    expect(find.text('${todayKey()} 的事件'), findsOneWidget);
    expect(find.text('09:00 – 10:00'), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsOneWidget);
  });

  testWidgets('空态：显示「这天没有日程」', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    expect(find.text('这天没有日程'), findsOneWidget);
  });

  testWidgets('日期导航 ▶ 切到明天：列表内容跟随', (tester) async {
    final c = container(events: [dayEvent(todayKey()), dayEvent(shiftDay(todayKey(), 1))]);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    // 当天显示今天的标题
    expect(find.text('${todayKey()} 的事件'), findsOneWidget);

    await tester.tap(find.byTooltip('后一天'));
    await tester.pumpAndSettle();

    expect(find.text('${shiftDay(todayKey(), 1)} 的事件'), findsOneWidget);
    expect(find.text('${todayKey()} 的事件'), findsNothing);
  });

  testWidgets('点日期文字：弹月历并跳到所选日期', (tester) async {
    // 月历打开在「当前月」：目标日取当月 15 号（每月都有，且在 42 格网格内唯一）。
    final target = '${todayKey().substring(0, 7)}-15';
    final c = container(events: [dayEvent(target)]);
    addTearDown(c.dispose);
    // 真实手机竖屏视口：默认 600px 高的测试面让月历 6 行网格超出 modal 半屏高度而 overflow
    // （同 month_calendar_sheet_test）。
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    await tester.tap(find.text(dateLabel(todayKey())));
    await tester.pumpAndSettle();
    expect(find.textContaining('年'), findsWidgets); // 月历标题

    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    // 月历 pop 后页面选中当月 15 号，列表显示该日事件
    expect(find.text('$target 的事件'), findsOneWidget);
  });

  testWidgets('FAB 打开新建弹窗（预填当前选中日）', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('新建日程'));
    await tester.pumpAndSettle();
    expect(find.text('新建日程'), findsOneWidget); // 弹窗标题
  });

  testWidgets('⋯ 删除：确认后调用 actions.delete', (tester) async {
    final events = [dayEvent(todayKey())];
    final c = container(events: events);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('日程操作'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();

    // 确认对话框
    expect(find.textContaining('删除后不可恢复'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '删除'));
    await tester.pumpAndSettle();

    // eventActionsProvider 是真实 EventActions：_api 走未 override 的 eventApiProvider
    // （测试环境 fail-fast，delete 抛错 → SnackBar）。这里只断言确认流程走完不崩。
    expect(find.byType(SnackBar), findsWidgets);
    // 走完 SnackBar 自动消失计时器，避免测试结束时仍有 pending timer
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
