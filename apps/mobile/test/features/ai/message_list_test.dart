import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_controller.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:serenique_mobile/features/ai/widgets/message_list.dart';

/// 注入固定状态的假控制器（只重写 build，不发真实连接）。
class FakeAiController extends AiController {
  FakeAiController(this.initial);
  final AiState initial;

  @override
  AiState build() => initial;
}

AiState stateWith({
  List<RenderMessage> messages = const [],
  TurnState? activeTurn,
  AiConnStatus status = AiConnStatus.online,
}) {
  return AiState(
    status: status,
    busy: false,
    lastError: null,
    currentSessionId: 's1',
    model: 'm',
    sessions: const [],
    messages: messages,
    activeTurn: activeTurn,
    hasMoreMessages: false,
    loadingMore: false,
    totalMessages: 0,
  );
}

Widget host(ProviderContainer container) => UncontrolledProviderScope(
  container: container,
  child: const MaterialApp(home: Scaffold(body: MessageList())),
);

void main() {
  testWidgets('user 消息右对齐气泡；assistant 消息静态 markdown', (tester) async {
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(
            stateWith(
              messages: [
                const RenderMessage(
                  role: 'user',
                  text: '你好',
                  thinking: '',
                  toolCalls: [],
                ),
                const RenderMessage(
                  role: 'assistant',
                  text: '**世界**',
                  thinking: '',
                  toolCalls: [],
                ),
              ],
            ),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('你好'), findsOneWidget);
    expect(find.text('世界'), findsOneWidget); // **世界** 渲染为粗体「世界」
  });

  testWidgets('activeTurn 无正文时显示「AI 正在思考…」', (tester) async {
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(stateWith(activeTurn: TurnState(1))),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('AI 正在思考…'), findsOneWidget);
  });

  testWidgets('activeTurn 有正文时渲染流式组件且不显示思考指示', (tester) async {
    final turn = TurnState(1);
    turn.text = '回答中';
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(stateWith(activeTurn: turn)),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('AI 正在思考…'), findsNothing);
    // MarkdownStream 渲染出自定义组件（无自带类型名，用文本断言当前轮内容）
    expect(turn.textController.hasListener, isTrue);
  });

  testWidgets('思考折叠块：默认收起，点击展开', (tester) async {
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(
            stateWith(
              messages: [
                const RenderMessage(
                  role: 'assistant',
                  text: '答案',
                  thinking: '推理过程',
                  toolCalls: [],
                ),
              ],
            ),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('推理过程'), findsNothing);
    await tester.tap(find.text('思考过程'));
    await tester.pumpAndSettle();
    expect(find.text('推理过程'), findsOneWidget);
  });

  testWidgets('hasMoreMessages 时顶部显示加载更多提示', (tester) async {
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(
            stateWith(
              messages: [
                const RenderMessage(
                  role: 'user',
                  text: '最新',
                  thinking: '',
                  toolCalls: [],
                ),
              ],
            ).copyWith(hasMoreMessages: true),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('向上滚动加载更多'), findsOneWidget);
  });

  testWidgets('loadingMore 时顶部显示加载指示器', (tester) async {
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(
            stateWith(
              messages: [
                const RenderMessage(
                  role: 'user',
                  text: '最新',
                  thinking: '',
                  toolCalls: [],
                ),
              ],
            ).copyWith(hasMoreMessages: true, loadingMore: true),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('向上滚动加载更多'), findsNothing);
  });

  testWidgets('无更多历史时不渲染顶部哨兵', (tester) async {
    final container = ProviderContainer(
      overrides: [
        aiControllerProvider.overrideWith(
          () => FakeAiController(
            stateWith(
              messages: [
                const RenderMessage(
                  role: 'user',
                  text: '最新',
                  thinking: '',
                  toolCalls: [],
                ),
              ],
            ).copyWith(hasMoreMessages: false),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('向上滚动加载更多'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}
