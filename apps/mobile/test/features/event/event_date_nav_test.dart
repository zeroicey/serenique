import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/event/widgets/event_date_nav.dart';

void main() {
  Widget host(ProviderContainer c) => UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: Scaffold(body: EventDateNav())),
      );

  testWidgets('◀ ▶ 切日并写回 provider', (tester) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));

    expect(c.read(eventSelectedDayProvider), todayKey());
    await tester.tap(find.byTooltip('后一天'));
    await tester.pump();
    expect(c.read(eventSelectedDayProvider), shiftDay(todayKey(), 1));

    await tester.tap(find.byTooltip('前一天'));
    await tester.pump();
    expect(c.read(eventSelectedDayProvider), todayKey());
  });

  testWidgets('今天：当天置灰，非当天点击回今天', (tester) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));

    TextButton todayButton() =>
        tester.widget<TextButton>(find.widgetWithText(TextButton, '今天'));
    expect(todayButton().onPressed, isNull); // 今天是今天 → 置灰

    await tester.tap(find.byTooltip('后一天'));
    await tester.pump();
    expect(todayButton().onPressed, isNotNull);

    await tester.tap(find.text('今天'));
    await tester.pump();
    expect(c.read(eventSelectedDayProvider), todayKey());
  });

  testWidgets('点日期：弹月历并回写 provider', (tester) async {
    // 月历 watch eventsInMonthProvider：override 成空列表，避免真实 HTTP（失败后
    // Riverpod 会留一个重试 timer，导致树销毁时 pending timer 断言炸）。
    final c = ProviderContainer(overrides: [
      eventsInMonthProvider.overrideWith((ref, month) async => const []),
    ]);
    addTearDown(c.dispose);
    // 真实手机竖屏视口：默认 600px 高的测试面让月历 6 行网格超出 modal 半屏高度而 overflow
    // （同 month_calendar_sheet_test）。
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(c));

    expect(c.read(eventSelectedDayProvider), todayKey());
    await tester.tap(find.text(dateLabel(todayKey())));
    await tester.pumpAndSettle();
    expect(find.textContaining('年'), findsWidgets); // 月历标题

    // 月历打开在「当前月」：目标日取当月 15 号（每月都有，且在 42 格网格内唯一）。
    final target = '${todayKey().substring(0, 7)}-15';
    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    expect(c.read(eventSelectedDayProvider), target);
  });
}
