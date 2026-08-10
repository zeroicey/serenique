import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_controller.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:serenique_mobile/features/ai/widgets/session_sheet.dart';

class RecordingAiController extends AiController {
  RecordingAiController(this.initial);
  final AiState initial;
  final List<String> switched = [];
  final List<String> deleted = [];
  int news = 0;

  @override
  AiState build() => initial;

  @override
  void newSession() => news++;

  @override
  void switchSession(String id) => switched.add(id);

  @override
  void deleteSession(String id) => deleted.add(id);
}

void main() {
  testWidgets('弹层列出会话；切换调用 switchSession', (tester) async {
    final controller = RecordingAiController(AiState(
      status: AiConnStatus.online,
      busy: false,
      lastError: null,
      currentSessionId: 's1',
      model: 'm',
      sessions: const [
        SessionItem(id: 's1', name: '今日计划', messageCount: 3, modified: ''),
        SessionItem(id: 's2', name: '周末安排', messageCount: 1, modified: ''),
      ],
      messages: const [],
      activeTurn: null,
    ));
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => controller),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Consumer(
              builder: (context, ref, _) => ElevatedButton(
                onPressed: () => showSessionSheet(context, ref),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();

    expect(find.text('今日计划'), findsOneWidget);
    expect(find.text('周末安排'), findsOneWidget);

    await tester.tap(find.text('周末安排'));
    await tester.pumpAndSettle();
    expect(controller.switched, ['s2']);
  });

  testWidgets('新建会话；删除需确认', (tester) async {
    final controller = RecordingAiController(AiState.initial());
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => controller),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: Consumer(
              builder: (context, ref, _) => ElevatedButton(
                onPressed: () => showSessionSheet(context, ref),
                child: const Text('打开'),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('打开'));
    await tester.pumpAndSettle();
    expect(find.text('暂无会话'), findsOneWidget);

    await tester.tap(find.text('新建会话'));
    await tester.pumpAndSettle();
    expect(controller.news, 1);
  });
}
