import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_controller.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:serenique_mobile/features/ai/widgets/composer_bar.dart';

class RecordingAiController extends AiController {
  RecordingAiController(this.initial);
  final AiState initial;
  final List<String> sentTexts = [];
  int aborts = 0;

  @override
  AiState build() => initial;

  @override
  void send(String text) {
    sentTexts.add(text);
    super.send(text);
  }

  @override
  void abort() {
    aborts++;
    super.abort();
  }
}

AiState idle() => const AiState.initial();

void main() {
  testWidgets('输入并点发送：send 收到 trim 后的文本且输入框清空', (tester) async {
    final controller = RecordingAiController(idle());
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => controller),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: Scaffold(body: ComposerBar())),
    ));

    await tester.enterText(find.byType(TextField), '  帮我加任务  ');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pump();

    expect(controller.sentTexts, ['帮我加任务']);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
  });

  testWidgets('空输入不发送；busy 时输入框禁用 + 停止按钮', (tester) async {
    final controller = RecordingAiController(idle());
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => controller),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: Scaffold(body: ComposerBar())),
    ));
    await tester.tap(find.byIcon(Icons.send));
    await tester.pump();
    expect(controller.sentTexts, isEmpty);

    // 切到 busy 状态
    final busyController = RecordingAiController(
      AiState(
        status: AiConnStatus.online,
        busy: true,
        lastError: null,
        currentSessionId: null,
        model: '',
        sessions: const [],
        messages: const [],
        activeTurn: null,
      ),
    );
    final busyContainer = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => busyController),
    ]);
    addTearDown(busyContainer.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: busyContainer,
      child: const MaterialApp(home: Scaffold(body: ComposerBar())),
    ));

    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    expect(find.byIcon(Icons.stop), findsOneWidget);
    await tester.tap(find.byIcon(Icons.stop));
    await tester.pump();
    expect(busyController.aborts, 1);
  });
}
