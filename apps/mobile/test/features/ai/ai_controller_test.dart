import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_controller.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// 测试假 WS 通道：记录发送内容，可手动注入入站事件。
class FakeWsChannel implements WebSocketChannel {
  final _incoming = StreamController<Object?>.broadcast();
  final List<Object?> sent = [];

  @override
  Stream get stream => _incoming.stream;

  @override
  WebSocketSink get sink => _FakeSink(this);

  @override
  Future<void> get ready => Future.value();

  @override
  int? get closeCode => null;

  @override
  String? get closeReason => null;

  @override
  String? get protocol => null;

  // WebSocketChannel 在 web_socket_channel 3.x 中同时实现 StreamChannelMixin，
  // 其余成员（pipe/transform/cast 等）测试中不会用到，运行时调用即报错。
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnsupportedError(
      'FakeWsChannel.${invocation.memberName} not used in tests');

  void emit(String json) => _incoming.add(json);

  void closeIncoming() => _incoming.close();
}

class _FakeSink implements WebSocketSink {
  _FakeSink(this._ch);
  final FakeWsChannel _ch;

  @override
  void add(Object? data) => _ch.sent.add(data);

  @override
  void addError(Object error, [StackTrace? stackTrace]) {}

  @override
  Future<void> addStream(Stream stream) async {
    await for (final e in stream) {
      add(e);
    }
  }

  @override
  Future<void> close([int? closeCode, String? closeReason]) async {}

  @override
  Future<void> get done => Future.value();
}

/// 每次 connect 新建一个 AiClient + FakeWsChannel（重连场景用）。
class TestHarness {
  TestHarness() {
    container = ProviderContainer(overrides: [
      aiClientFactoryProvider.overrideWithValue(() {
        final ch = FakeWsChannel();
        channels.add(ch);
        return AiClient(
          baseUrl: 'https://api.example.com',
          tokenReader: () => null,
          channelFactory: (uri, headers) => ch,
        );
      }),
    ]);
  }

  late final ProviderContainer container;
  final channels = <FakeWsChannel>[];

  FakeWsChannel get channel => channels.single;
  AiController get notifier => container.read(aiControllerProvider.notifier);
  AiState get state => container.read(aiControllerProvider);

  Future<void> connect() async {
    final done = notifier.connect();
    // connect() 先 await client.connect()；client.connect 不 await 出网，直接返回
    await done;
    // broadcast 流事件异步投递（多个微任务跳数），冲刷队列后状态才最终落定
    // （如 connecting→online），与 ai_client_test.dart 的 flush 同因。
    await pumpEventQueue();
  }
}

void main() {
  test('connect：online 状态；未连接 send 不发', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();
    expect(h.state.status, AiConnStatus.online);

    h.notifier.send('  ');
    expect(h.channel.sent, isEmpty);
  });

  test('session_ready：设置会话/模型/历史消息并刷新会话列表', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({
      'type': 'session_ready',
      'sessionId': 's1',
      'model': 'opencode-go/deepseek-v4-flash',
      'messages': [
        {'role': 'user', 'text': '帮我排计划', 'thinking': '', 'toolCalls': []},
        {'role': 'assistant', 'text': '好的', 'thinking': '', 'toolCalls': []},
      ],
    }));
    await pumpEventQueue();
    expect(h.state.currentSessionId, 's1');
    expect(h.state.model, 'opencode-go/deepseek-v4-flash');
    expect(h.state.messages.length, 2);
    expect(h.state.messages.last.text, '好的');
    expect(jsonDecode(h.channel.sent.last as String)['type'], 'list_sessions');
  });

  test('turn 流：delta 聚合 + 流式通道 + 工具卡 + turn_end 归并', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    await pumpEventQueue();
    final streamed = <String>[];
    h.state.activeTurn!.textController.stream.listen(streamed.add);

    h.channel.emit(jsonEncode({
      'type': 'message_update',
      'assistantMessageEvent': {'type': 'text_delta', 'delta': '你好'},
    }));
    h.channel.emit(jsonEncode({
      'type': 'message_update',
      'assistantMessageEvent': {'type': 'text_delta', 'delta': '，世界'},
    }));
    h.channel.emit(jsonEncode({
      'type': 'tool_execution_start',
      'toolCallId': 't1',
      'toolName': 'list_tasks',
      'args': {},
    }));
    h.channel.emit(jsonEncode({
      'type': 'tool_execution_update',
      'toolCallId': 't1',
      'toolName': 'list_tasks',
      'partialResult': '{"items":[]}',
    }));
    h.channel.emit(jsonEncode({
      'type': 'tool_execution_end',
      'toolCallId': 't1',
      'toolName': 'list_tasks',
      'result': '',
      'isError': false,
    }));
    h.channel.emit(jsonEncode({'type': 'turn_end'}));
    await pumpEventQueue();

    expect(streamed, ['你好', '，世界']);
    expect(h.state.messages, hasLength(1));
    final m = h.state.messages.single;
    expect(m.role, 'assistant');
    expect(m.text, '你好，世界');
    expect(m.toolCalls.single.id, 't1');
    // 归并规则镜像 Web ai-store.ts：partial + '\n' + 最终 result（此处最终 result 为空，
    // 故结果为 '{"items":[]}\n'）。
    expect(m.toolCalls.single.result, '{"items":[]}\n');
    expect(m.toolCalls.single.isError, isFalse);
    expect(h.state.activeTurn, isNull);
  });

  test('空轮不追加；thinking_delta 进 thinking', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    h.channel.emit(jsonEncode({
      'type': 'message_update',
      'assistantMessageEvent': {'type': 'thinking_delta', 'delta': '想一下'},
    }));
    h.channel.emit(jsonEncode({'type': 'turn_end'}));
    await pumpEventQueue();

    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.thinking, '想一下');
    expect(h.state.messages.single.text, '');
  });

  test('agent_start/agent_end：busy 切换 + agent_end 兜底归并', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'agent_start'}));
    await pumpEventQueue();
    expect(h.state.busy, isTrue);
    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    h.channel.emit(jsonEncode({
      'type': 'message_update',
      'assistantMessageEvent': {'type': 'text_delta', 'delta': 'ok'},
    }));
    h.channel.emit(jsonEncode({'type': 'agent_end'}));
    await pumpEventQueue();
    expect(h.state.busy, isFalse);
    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.text, 'ok');
  });

  test('error 事件：busy 复位 + lastError；agent_end 清空', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'agent_start'}));
    h.channel.emit(jsonEncode({'type': 'error', 'message': '模型超时'}));
    await pumpEventQueue();
    expect(h.state.busy, isFalse);
    expect(h.state.lastError, '模型超时');

    h.channel.emit(jsonEncode({'type': 'agent_end'}));
    await pumpEventQueue();
    expect(h.state.lastError, isNull);
  });

  test('send：乐观追加 user 消息 + 发 prompt', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.notifier.send('帮我加个任务');
    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.role, 'user');
    expect(h.state.messages.single.text, '帮我加个任务');
    expect(jsonDecode(h.channel.sent.single as String),
        {'type': 'prompt', 'text': '帮我加个任务'});
  });

  test('会话动作消息序列', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.notifier.newSession();
    h.notifier.switchSession('s2');
    h.notifier.deleteSession('s2');
    h.notifier.refreshSessions();
    h.notifier.abort();

    final types =
        h.channel.sent.map((m) => jsonDecode(m as String)['type']).toList();
    expect(types, ['new_session', 'switch_session', 'delete_session', 'list_sessions', 'abort']);
  });

  test('断线 → offline；重连新建通道', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.closeIncoming();
    await Future<void>.delayed(Duration.zero);
    expect(h.state.status, AiConnStatus.offline);

    await h.notifier.connect();
    await pumpEventQueue();
    expect(h.channels, hasLength(2));
    expect(h.state.status, AiConnStatus.online);
  });
}
