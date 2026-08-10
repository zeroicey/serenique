import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/event/widgets/month_calendar_sheet.dart';

void main() {
  ProviderContainer container({List<EventEntry> monthEvents = const []}) => ProviderContainer(
        overrides: [
          eventsInMonthProvider.overrideWith((ref, month) async => monthEvents),
        ],
      );

  /// 挂载 host（打开按钮 + 捕获 sheet future），对齐 session_sheet_test 的 inline 模式。
  Future<Future<String?> Function()> host(WidgetTester tester, ProviderContainer c) async {
    // 真实手机竖屏视口：默认 600px 高的测试面让月历 6 行网格超出 modal 半屏高度而 overflow。
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    late Future<String?> future;
    await tester.pumpWidget(UncontrolledProviderScope(
      container: c,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () {
                  future = showMonthCalendarSheet(context, initialDay: '2026-08-12');
                },
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    return () => future;
  }

  testWidgets('网格渲染当前月 + 点选日返回 dayKey', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    final sheet = await host(tester, c);
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('2026年8月'), findsOneWidget);
    // Aug 2026: 1 号是周六 → 前置 7 月 27-31、后置 9 月 1-6。故「1」= 8月1 + 9月1(后置)，
    // 「31」= 7月31(前置) + 8月31，各 2 个；「15」仅 8 月唯一。
    expect(find.text('1'), findsNWidgets(2));
    expect(find.text('31'), findsNWidgets(2));
    expect(find.text('15'), findsOneWidget);

    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    expect(await sheet(), '2026-08-15');
  });

  testWidgets('日程圆点：有事件的日子带圆点 key', (tester) async {
    final c = container(monthEvents: [
      EventEntry(
        id: 'e1', title: 'x',
        startAt: withOffset(DateTime(2026, 8, 5, 9)),
        endAt: withOffset(DateTime(2026, 8, 5, 10)),
        isAllDay: false, createdAt: 't', updatedAt: 't',
      ),
    ]);
    addTearDown(c.dispose);
    await host(tester, c);
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('dot-2026-08-05')), findsOneWidget);
    expect(find.byKey(const ValueKey('dot-2026-08-06')), findsNothing);
  });

  testWidgets('切月：chevron_right 显示下月，今天按钮 pop today', (tester) async {
    final c = container();
    addTearDown(c.dispose);
    final sheet = await host(tester, c);
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.chevron_right));
    await tester.pumpAndSettle();
    expect(find.text('2026年9月'), findsOneWidget);

    await tester.tap(find.text('今天'));
    await tester.pumpAndSettle();
    expect(await sheet(), todayKey());
  });
}
