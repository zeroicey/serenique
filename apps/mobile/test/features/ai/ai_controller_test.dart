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
    'FakeWsChannel.${invocation.memberName} not used in tests',
  );

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
    container = ProviderContainer(
      overrides: [
        aiClientFactoryProvider.overrideWithValue(() {
          final ch = FakeWsChannel();
          channels.add(ch);
          return AiClient(
            baseUrl: 'https://api.example.com',
            tokenReader: () => null,
            channelFactory: (uri, headers) => ch,
          );
        }),
      ],
    );
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

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'opencode-go/deepseek-v4-flash',
        'messages': [
          {'role': 'user', 'text': '帮我排计划', 'thinking': '', 'toolCalls': []},
          {'role': 'assistant', 'text': '好的', 'thinking': '', 'toolCalls': []},
        ],
      }),
    );
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

    h.channel.emit(
      jsonEncode({
        'type': 'message_update',
        'assistantMessageEvent': {'type': 'text_delta', 'delta': '你好'},
      }),
    );
    h.channel.emit(
      jsonEncode({
        'type': 'message_update',
        'assistantMessageEvent': {'type': 'text_delta', 'delta': '，世界'},
      }),
    );
    h.channel.emit(
      jsonEncode({
        'type': 'tool_execution_start',
        'toolCallId': 't1',
        'toolName': 'list_tasks',
        'args': {},
      }),
    );
    h.channel.emit(
      jsonEncode({
        'type': 'tool_execution_update',
        'toolCallId': 't1',
        'toolName': 'list_tasks',
        'partialResult': '{"items":[]}',
      }),
    );
    h.channel.emit(
      jsonEncode({
        'type': 'tool_execution_end',
        'toolCallId': 't1',
        'toolName': 'list_tasks',
        'result': '',
        'isError': false,
      }),
    );
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

  test('thinking-only 轮归并进 messages', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    h.channel.emit(
      jsonEncode({
        'type': 'message_update',
        'assistantMessageEvent': {'type': 'thinking_delta', 'delta': '想一下'},
      }),
    );
    h.channel.emit(jsonEncode({'type': 'turn_end'}));
    await pumpEventQueue();

    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.thinking, '想一下');
    expect(h.state.messages.single.text, '');
  });

  test('空轮（turn_start → turn_end 无任何 delta/工具事件）：不追加、activeTurn 复位', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    h.channel.emit(jsonEncode({'type': 'turn_end'}));
    await pumpEventQueue();

    expect(h.state.messages, isEmpty);
    expect(h.state.activeTurn, isNull);
  });

  test('agent_start/agent_end：busy 切换 + agent_end 兜底归并', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'agent_start'}));
    await pumpEventQueue();
    expect(h.state.busy, isTrue);
    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    h.channel.emit(
      jsonEncode({
        'type': 'message_update',
        'assistantMessageEvent': {'type': 'text_delta', 'delta': 'ok'},
      }),
    );
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

  test('error 事件复位 loadingMore（load_more 异常不再永久卡死懒加载）', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '最新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 50,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();

    h.notifier.loadMore();
    expect(h.state.loadingMore, isTrue);

    // load_more 分支异常 → 后端回 error 而非 messages_loaded
    h.channel.emit(jsonEncode({'type': 'error', 'message': 'load_more 失败'}));
    await pumpEventQueue();
    expect(h.state.loadingMore, isFalse);
    expect(h.state.lastError, 'load_more 失败');

    // 复位后可再次发起加载
    final sentBefore = h.channel.sent.length;
    h.notifier.loadMore();
    await pumpEventQueue();
    expect(h.channel.sent.length, sentBefore + 1);
  });

  test('send：乐观追加 user 消息 + 发 prompt', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.notifier.send('帮我加个任务');
    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.role, 'user');
    expect(h.state.messages.single.text, '帮我加个任务');
    expect(jsonDecode(h.channel.sent.single as String), {
      'type': 'prompt',
      'text': '帮我加个任务',
    });
  });

  test('offline 状态 send：不追加 user 消息、不发 prompt（防幽灵消息）', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.closeIncoming();
    await Future<void>.delayed(Duration.zero);
    expect(h.state.status, AiConnStatus.offline);

    h.notifier.send('离线时的消息');
    expect(h.state.messages, isEmpty);
    expect(h.channel.sent, isEmpty);
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

    final types = h.channel.sent
        .map((m) => jsonDecode(m as String)['type'])
        .toList();
    expect(types, [
      'new_session',
      'switch_session',
      'delete_session',
      'list_sessions',
      'abort',
    ]);
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

  test('session_ready 带 hasMore 时设置分页状态', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '最新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 50,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();
    expect(h.state.hasMoreMessages, isTrue);
    expect(h.state.totalMessages, 50);
    expect(h.state.messages, hasLength(1));
  });

  test('loadMore：发 load_more 并置 loadingMore；防并发不重复发', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '最新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 50,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();

    h.notifier.loadMore();
    expect(jsonDecode(h.channel.sent.last as String), {'type': 'load_more'});
    expect(h.state.loadingMore, isTrue);

    final sentBefore = h.channel.sent.length;
    h.notifier.loadMore();
    expect(h.channel.sent.length, sentBefore);
  });

  test('hasMore=false 时 loadMore 不发请求', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    final sentBefore = h.channel.sent.length;
    h.notifier.loadMore();
    expect(h.channel.sent.length, sentBefore);
  });

  test('messages_loaded：prepend 更早消息到 messages 前面', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '最新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 2,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();
    expect(h.state.messages.single.text, '最新');

    h.notifier.loadMore();
    h.channel.emit(
      jsonEncode({
        'type': 'messages_loaded',
        'messages': [
          {'role': 'assistant', 'text': '更早', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 2,
        'hasMore': false,
      }),
    );
    await pumpEventQueue();

    expect(h.state.loadingMore, isFalse);
    expect(h.state.hasMoreMessages, isFalse);
    expect(h.state.messages, hasLength(2));
    expect(h.state.messages.first.text, '更早');
    expect(h.state.messages.last.text, '最新');
  });

  test('session_switched chainContinuation：保留时间线 + 追加系统 marker', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '之前', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 5,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();
    expect(h.state.messages.single.text, '之前');

    // 24h 自动切换 → chainContinuation（链延续）
    h.channel.emit(
      jsonEncode({
        'type': 'session_switched',
        'sessionId': 's2',
        'model': 'm',
        'messages': [],
        'totalMessageCount': 0,
        'hasMore': false,
        'chainContinuation': true,
        'reason': 'auto_timeout',
        'marker': '已开启新会话',
      }),
    );
    await pumpEventQueue();

    expect(h.state.currentSessionId, 's2');
    expect(h.state.messages, hasLength(2));
    expect(h.state.messages.first.text, '之前'); // 已加载时间线保留
    expect(h.state.messages.last.kind, 'system');
    expect(h.state.messages.last.text, '已开启新会话');
    // 链延续不重置分页状态（后端 0/0 不代表合并流整体）
    expect(h.state.totalMessages, 5);
    expect(h.state.hasMoreMessages, isTrue);
  });

  test('session_switched 非链延续：重置时间线', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '旧', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 3,
        'hasMore': false,
      }),
    );
    await pumpEventQueue();
    h.channel.emit(
      jsonEncode({
        'type': 'session_switched',
        'sessionId': 's3',
        'model': 'm',
        'messages': [
          {'role': 'assistant', 'text': '新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 1,
        'hasMore': false,
      }),
    );
    await pumpEventQueue();

    expect(h.state.currentSessionId, 's3');
    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.text, '新');
  });

  test('session_compacted：重建分页基线 + resyncTick 递增', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '旧', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 50,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();
    expect(h.state.resyncTick, 0);

    h.channel.emit(
      jsonEncode({
        'type': 'session_compacted',
        'sessionId': 's1',
        'messages': [
          {
            'role': 'compactionSummary',
            'kind': 'compaction',
            'text': '已压缩早期对话',
            'detail': '摘要',
            'thinking': '',
            'toolCalls': [],
          },
          {
            'role': 'assistant',
            'text': '最新',
            'thinking': '',
            'toolCalls': [],
          },
        ],
        'totalMessageCount': 12,
        'hasMore': true,
        'anchor': 2,
      }),
    );
    await pumpEventQueue();

    expect(h.state.messages, hasLength(2));
    expect(h.state.messages.first.isCompactionSummary, isTrue);
    expect(h.state.messages.first.detail, '摘要');
    expect(h.state.messages.last.text, '最新');
    expect(h.state.totalMessages, 12);
    expect(h.state.hasMoreMessages, isTrue);
    expect(h.state.resyncTick, 1);
    // 评审 B2/建议 4：摘要卡片状态 + 当前会话同步
    expect(h.state.compactionSummary, isNull); // 无 summary 字段 → null
    expect(h.state.compactionTailStart, 2);
    expect(h.state.currentSessionId, 's1');
  });

  test('session_compacted 带 summary：压缩摘要卡片状态 + 更早消息替换为摘要视图',
      () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '旧', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 50,
        'hasMore': true,
      }),
    );
    await pumpEventQueue();

    h.channel.emit(
      jsonEncode({
        'type': 'session_compacted',
        'sessionId': 's9',
        'messages': [
          {'role': 'assistant', 'text': '保留', 'thinking': '', 'toolCalls': []},
          {'role': 'assistant', 'text': '最新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 10,
        'hasMore': true,
        'anchor': 2,
        'summary': '早期对话摘要：聊了任务与日程',
      }),
    );
    await pumpEventQueue();

    // 摘要不并入 messages/total（分页计数零扰动），仅存 compactionSummary + 卡片下标
    expect(h.state.messages, hasLength(2));
    expect(h.state.compactionSummary, '早期对话摘要：聊了任务与日程');
    expect(h.state.compactionTailStart, 2);
    expect(h.state.currentSessionId, 's9'); // 评审建议 4：压缩重同步同步当前会话
    expect(h.state.totalMessages, 10);
  });

  test('compaction_end errorMessage：经 lastError 透传提示（评审建议 2）',
      () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'compaction_start', 'reason': 'manual'}));
    await pumpEventQueue();
    expect(h.state.compacting, isTrue);

    h.channel.emit(
      jsonEncode({
        'type': 'compaction_end',
        'reason': 'manual',
        'aborted': true,
        'willRetry': false,
        'errorMessage': '上下文无需压缩',
      }),
    );
    await pumpEventQueue();
    expect(h.state.compacting, isFalse);
    expect(h.state.lastError, '压缩失败：上下文无需压缩');

    // 成功结束（无 errorMessage、未 aborted）：不产生错误提示
    h.channel.emit(
      jsonEncode({
        'type': 'compaction_end',
        'reason': 'manual',
        'aborted': false,
        'willRetry': false,
      }),
    );
    await pumpEventQueue();
    expect(h.state.compacting, isFalse);
  });

  test('chainContinuation：marker 插到乐观 userMsg 之前（评审建议 1）', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(
      jsonEncode({
        'type': 'session_ready',
        'sessionId': 's1',
        'model': 'm',
        'messages': [
          {'role': 'user', 'text': '之前', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 5,
        'hasMore': false,
      }),
    );
    await pumpEventQueue();

    // 用户发送（乐观追加 optimistic userMsg）
    h.notifier.send('帮我记一下');
    await pumpEventQueue();
    expect(h.state.messages.last.optimistic, isTrue);

    // 24h 自动切换 → chainContinuation：marker 应插到该乐观 userMsg 之前
    h.channel.emit(
      jsonEncode({
        'type': 'session_switched',
        'sessionId': 's2',
        'model': 'm',
        'messages': [],
        'totalMessageCount': 0,
        'hasMore': false,
        'chainContinuation': true,
        'reason': 'auto_timeout',
        'marker': '已开启新会话',
      }),
    );
    await pumpEventQueue();

    expect(h.state.messages.last.text, '帮我记一下'); // userMsg 仍在末尾
    expect(h.state.messages[1].kind, 'system'); // marker 插到 userMsg 前
    expect(h.state.messages[1].text, '已开启新会话');
    expect(h.state.messages.last.optimistic, isFalse); // 标记已清除
  });

  test('compaction_start/end 切换 compacting', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'compaction_start', 'reason': 'manual'}));
    await pumpEventQueue();
    expect(h.state.compacting, isTrue);

    h.channel.emit(
      jsonEncode({
        'type': 'compaction_end',
        'reason': 'manual',
        'aborted': false,
        'willRetry': false,
      }),
    );
    await pumpEventQueue();
    expect(h.state.compacting, isFalse);
  });

  test('sendInput：斜杠命令拦截（/new /compact /foo）', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    expect(h.notifier.sendInput('/new'), isTrue);
    expect(jsonDecode(h.channel.sent.last as String)['type'], 'new_session');

    h.notifier.sendInput('/compact');
    expect(jsonDecode(h.channel.sent.last as String)['type'], 'compact');

    // 未知命令：不发送、返回 false（供前端提示「未知命令」）
    final sentBefore = h.channel.sent.length;
    expect(h.notifier.sendInput('/foo'), isFalse);
    expect(h.channel.sent.length, sentBefore);
    expect(h.state.messages, isEmpty); // 未追加 user 消息

    // 普通文本：发 prompt + 乐观追加 user 消息
    expect(h.notifier.sendInput('帮我记一下'), isTrue);
    expect(
      jsonDecode(h.channel.sent.last as String),
      {'type': 'prompt', 'text': '帮我记一下'},
    );
    expect(h.state.messages.last.role, 'user');
  });

  test('messages_loaded：prepend 后 compactionTailStart 前移（摘要卡片保持位置）', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    // 先压缩建立摘要卡片（tailStart=2）
    h.channel.emit(
      jsonEncode({
        'type': 'session_compacted',
        'sessionId': 's1',
        'messages': [
          {'role': 'assistant', 'text': '保留', 'thinking': '', 'toolCalls': []},
          {'role': 'assistant', 'text': '最新', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 10,
        'hasMore': true,
        'anchor': 2,
        'summary': '摘要内容',
      }),
    );
    await pumpEventQueue();
    expect(h.state.compactionSummary, '摘要内容');
    expect(h.state.compactionTailStart, 2);

    // load_more 加载更早批次 → prepend → tailStart 前移 batch 长度（评审 B2）
    h.notifier.loadMore();
    h.channel.emit(
      jsonEncode({
        'type': 'messages_loaded',
        'messages': [
          {'role': 'assistant', 'text': '更早A', 'thinking': '', 'toolCalls': []},
          {'role': 'assistant', 'text': '更早B', 'thinking': '', 'toolCalls': []},
        ],
        'totalMessageCount': 10,
        'hasMore': false,
      }),
    );
    await pumpEventQueue();

    expect(h.state.messages, hasLength(4));
    expect(h.state.messages.first.text, '更早A');
    expect(h.state.messages.last.text, '最新');
    expect(h.state.compactionTailStart, 4); // 2 + 2：卡片在更早批次之后位置保持
  });
}
