import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/event/event_models.dart';
import 'package:serenique_mobile/features/event/event_providers.dart';
import 'package:serenique_mobile/features/event/event_time.dart';
import 'package:serenique_mobile/features/event/widgets/event_edit_sheet.dart';

/// 记录动作的 EventActions 假实现（EventActions 方法默认虚，可覆写）。
class _RecordingActions extends EventActions {
  _RecordingActions(super.ref);

  final List<Map<String, Object?>> created = [];
  int updates = 0;

  static final _entry = EventEntry(
    id: 'e1', title: 'x',
    startAt: '2026-08-05T09:00:00+08:00', endAt: '2026-08-05T10:00:00+08:00',
    isAllDay: false, createdAt: 't', updatedAt: 't',
  );

  @override
  Future<EventEntry> create({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    created.add({
      'title': title, 'startAt': startAt, 'endAt': endAt,
      'isAllDay': isAllDay, 'location': location, 'note': note,
    });
    return _entry;
  }

  @override
  Future<EventEntry> update(
    String id, {
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    required bool isAllDay,
    String location = '',
    String note = '',
  }) async {
    updates++;
    return _entry;
  }
}

void main() {
  testWidgets('新建提交：默认选中日 09:00-10:00，create 收到全字段', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '标题'), '晨会');
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    final recorded = (container.read(eventActionsProvider) as _RecordingActions).created.single;
    expect(recorded['title'], '晨会');
    expect(recorded['isAllDay'], isFalse);
    final start = recorded['startAt'] as DateTime;
    expect(start.year, 2026);
    expect(start.month, 8);
    expect(start.day, 12);
    expect(start.hour, 9);
  });

  testWidgets('全天切换：开始/结束副标题变日期格式', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('09:00'), findsOneWidget); // 时段模式
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(find.text('8月12日'), findsNWidgets(2)); // 开始/结束都显示日期
    expect(find.text('09:00'), findsNothing);
  });

  testWidgets('全天结束早于开始：SnackBar 拦截、不调 create', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '标题'), 'x');
    await tester.tap(find.byType(Switch)); // 全天
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, '结束')); // 结束日期选择器
    await tester.pumpAndSettle();
    await tester.tap(find.text('11')); // 选 8/11（早于开始 8/12）
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK')); // 确认（无 zh 本地化时是 OK）
    await tester.pumpAndSettle();
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    expect(find.text('结束时间必须晚于开始时间'), findsOneWidget);
    expect((container.read(eventActionsProvider) as _RecordingActions).created, isEmpty);
    // 走完 SnackBar 自动消失计时器，避免测试结束时仍有 pending timer
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });

  testWidgets('编辑回填：标题/地点/备注预填，保存走 update', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    final editing = EventEntry(
      id: 'e1',
      title: '晨会',
      startAt: withOffset(DateTime(2026, 8, 5, 9)),
      endAt: withOffset(DateTime(2026, 8, 5, 10)),
      isAllDay: false,
      location: '会议室',
      note: '带笔',
      createdAt: 't',
      updatedAt: 't',
    );
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => showEventEditSheet(context, event: editing),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('编辑日程'), findsOneWidget);
    expect(find.text('晨会'), findsOneWidget); // 标题回填
    expect(find.text('会议室'), findsOneWidget); // 地点回填
    expect(find.text('带笔'), findsOneWidget); // 备注回填
    expect(find.text('09:00'), findsOneWidget); // 开始时间回填

    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect((container.read(eventActionsProvider) as _RecordingActions).updates, 1);
  });

  testWidgets('标题为空：SnackBar 拦截、不调 create', (tester) async {
    final container = ProviderContainer(overrides: [
      eventActionsProvider.overrideWith((ref) => _RecordingActions(ref)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => showEventEditSheet(context, day: '2026-08-12'),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('创建'));
    await tester.pumpAndSettle();

    expect(find.text('请输入日程标题'), findsOneWidget);
    expect((container.read(eventActionsProvider) as _RecordingActions).created, isEmpty);
    // 走完 SnackBar 自动消失计时器，避免测试结束时仍有 pending timer
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
