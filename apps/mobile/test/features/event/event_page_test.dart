import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_page.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';

/// 按 dayKey 生成当日 09:00 的事件（标题带 dayKey，便于断言选中日列表）。
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
          // 按 dayKey 过滤：dayEvent 的 id 带 dayKey（'e-<day>'）。
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
    // 无 FAB：新建入口在 AppShell AppBar。
    expect(find.byType(FloatingActionButton), findsNothing);
  });

  testWidgets('空态：显示「这天没有日程」', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();

    expect(find.text('这天没有日程'), findsOneWidget);
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
