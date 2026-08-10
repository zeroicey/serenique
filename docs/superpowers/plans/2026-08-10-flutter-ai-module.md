# Flutter 移动端 AI 模块（宁序）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 apps/mobile 的 `/ai` 占位页替换为宁序 AI 聊天页（WS 聊天、流式 Markdown、思考块、工具卡、会话管理），功能与 Web 端对齐。

**Architecture:** 新增 `features/ai/` 平铺模块：`ai_client.dart`（IOWebSocketChannel + Bearer 认证）→ `ai_controller.dart`（Riverpod Notifier，消息聚合逻辑镜像 Web `ai-store.ts`）→ `ai_page.dart` + widgets（聊天 UI）。流式 Markdown 用 `flutter_markdown_stream`（内部是 flutter_markdown_plus + SafeMarkdownParser），历史消息静态渲染用 `MarkdownBody`。后端零改动。

**Tech Stack:** Flutter（Dart ^3.12.2）、Riverpod 3（手写 Notifier）、go_router、`web_socket_channel` ^3.0.3、`flutter_markdown_plus` ^1.0.12、`flutter_markdown_stream` ^0.4.0、`url_launcher` ^6.3.1。

**Design doc:** `.ai/architecture/2026-08-10-flutter-ai-module-design.md`

## Global Constraints

- 所有命令在 `apps/mobile/` 目录下执行；若 `flutter pub` 网络失败，先 `export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897`（技术栈文档 §7 已记）。
- 门禁：每次任务结束 `flutter analyze` + `flutter test` 全绿。
- WS 协议以后端 `services/api/src/modules/ai/ai.types.ts` 为权威来源，只复制类型结构、不 import 后端代码。
- 模型类手写，字段名与协议一致；用户可见文案全中文。
- 新增依赖只允许这 4 个，不引聊天 UI 套件/组件库。
- Commit message 英文 conventional style（`feat(mobile): ...`）。
- 测试约定：`test/features/ai/` 下按测试目标建文件；widget 测试用 `ProviderScope(overrides:)` / `ProviderContainer(overrides:)` 注入。

---

### Task 1: 依赖 + WS 协议类型 + 渲染模型

**Files:**
- Modify: `apps/mobile/pubspec.yaml`（dependencies 段）
- Create: `apps/mobile/lib/features/ai/ai_protocol.dart`
- Create: `apps/mobile/lib/features/ai/ai_models.dart`
- Test: `apps/mobile/test/features/ai/ai_protocol_test.dart`
- Test: `apps/mobile/test/features/ai/ai_models_test.dart`

**Interfaces:**
- Consumes: 无（本任务是最底层）。
- Produces:
  - `sealed class ClientMessage`，具体类 `ClientPrompt(text)` / `ClientAbort()` / `ClientNewSession()` / `ClientSwitchSession(sessionId)` / `ClientDeleteSession(sessionId)` / `ClientListSessions()`，均有 `Map<String, Object?> toJson()`。
  - `sealed class ServerMessage` + 工厂 `ServerMessage? fromJson(Object? json)`；具体类：`SessionsMessage(List<SessionItem>)`、`SessionReadyMessage(sessionId, model, messages)`、`SessionSwitchedMessage(sessionId, model, messages)`、`SessionDeletedMessage(sessionId)`、`ErrorMessage(message)`、`AgentStartMessage`、`AgentSettledMessage`、`TurnStartMessage`、`TurnEndMessage`、`AgentEndMessage`、`MessageUpdateMessage(isTextDelta, delta)`、`ToolExecutionStartMessage(toolCallId, toolName, args)`、`ToolExecutionUpdateMessage(toolCallId, toolName, partialResult)`、`ToolExecutionEndMessage(toolCallId, toolName, result, isError)`。
  - `ai_models.dart`：`SessionItem(id, name, messageCount, modified)` + `fromJson`；`RenderToolCall(id, name, args, result, isError)`；`RenderMessage(role, text, thinking, toolCalls)` + `fromJson`；`ToolCardState(id, name, args, result, isError, running)`；`TurnState(id)`（可变字段 `thinking`/`text`/`toolCards` + `textController` StreamController + `close()` + `isEmpty`）。

- [ ] **Step 1: 添加依赖**

```bash
cd apps/mobile
flutter pub add web_socket_channel flutter_markdown_plus flutter_markdown_stream url_launcher
```

期望：pubspec.yaml dependencies 出现 4 个新条目，`flutter pub get` 成功解析（flutter_markdown_stream 会连带解析 flutter_markdown_plus，版本不冲突）。

- [ ] **Step 2: 写协议类型文件**

`apps/mobile/lib/features/ai/ai_protocol.dart`：

```dart
// 宁序 AI 助手 WS 协议消息类型（客户端 → 服务端 / 服务端 → 客户端）。
// 与后端 services/api/src/modules/ai/ai.types.ts 一一对应；后端为权威来源，
// 变更协议时需同步两边。仅复制类型结构，不 import 后端代码。
import 'ai_models.dart';

sealed class ClientMessage {
  const ClientMessage();
  Map<String, Object?> toJson();
}

final class ClientPrompt extends ClientMessage {
  const ClientPrompt(this.text);
  final String text;
  @override
  Map<String, Object?> toJson() => {'type': 'prompt', 'text': text};
}

final class ClientAbort extends ClientMessage {
  const ClientAbort();
  @override
  Map<String, Object?> toJson() => {'type': 'abort'};
}

final class ClientListSessions extends ClientMessage {
  const ClientListSessions();
  @override
  Map<String, Object?> toJson() => {'type': 'list_sessions'};
}

final class ClientNewSession extends ClientMessage {
  const ClientNewSession();
  @override
  Map<String, Object?> toJson() => {'type': 'new_session'};
}

final class ClientSwitchSession extends ClientMessage {
  const ClientSwitchSession(this.sessionId);
  final String sessionId;
  @override
  Map<String, Object?> toJson() => {'type': 'switch_session', 'sessionId': sessionId};
}

final class ClientDeleteSession extends ClientMessage {
  const ClientDeleteSession(this.sessionId);
  final String sessionId;
  @override
  Map<String, Object?> toJson() => {'type': 'delete_session', 'sessionId': sessionId};
}

sealed class ServerMessage {
  const ServerMessage();

  /// JSON → 具体消息；未知 type 或解析失败返回 null（调用方忽略）。
  static ServerMessage? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final type = json['type'];
    switch (type) {
      case 'sessions':
        final items = (json['sessions'] as List? ?? const [])
            .whereType<Map<String, Object?>>()
            .map(SessionItem.fromJson)
            .toList();
        return SessionsMessage(items);
      case 'session_ready':
        return SessionReadyMessage(
          json['sessionId'] as String,
          (json['model'] as String?) ?? '',
          (json['messages'] as List? ?? const []).toList(),
        );
      case 'session_switched':
        return SessionSwitchedMessage(
          json['sessionId'] as String,
          (json['model'] as String?) ?? '',
          (json['messages'] as List? ?? const []).toList(),
        );
      case 'session_deleted':
        return SessionDeletedMessage(json['sessionId'] as String);
      case 'error':
        return ErrorMessage((json['message'] as String?) ?? '未知错误');
      case 'agent_start':
        return const AgentStartMessage();
      case 'agent_settled':
        return const AgentSettledMessage();
      case 'turn_start':
        return const TurnStartMessage();
      case 'turn_end':
        return const TurnEndMessage();
      case 'agent_end':
        return const AgentEndMessage();
      case 'message_update':
        final ev = json['assistantMessageEvent'];
        if (ev is! Map<String, Object?>) return null;
        final kind = ev['type'];
        if (kind != 'text_delta' && kind != 'thinking_delta') return null;
        return MessageUpdateMessage(
          isTextDelta: kind == 'text_delta',
          delta: (ev['delta'] as String?) ?? '',
        );
      case 'tool_execution_start':
        return ToolExecutionStartMessage(
          json['toolCallId'] as String,
          (json['toolName'] as String?) ?? '',
          json['args'],
        );
      case 'tool_execution_update':
        return ToolExecutionUpdateMessage(
          json['toolCallId'] as String,
          (json['toolName'] as String?) ?? '',
          (json['partialResult'] as String?) ?? '',
        );
      case 'tool_execution_end':
        return ToolExecutionEndMessage(
          json['toolCallId'] as String,
          (json['toolName'] as String?) ?? '',
          (json['result'] as String?) ?? '',
          (json['isError'] as bool?) ?? false,
        );
      default:
        return null;
    }
  }
}

final class SessionsMessage extends ServerMessage {
  const SessionsMessage(this.sessions);
  final List<SessionItem> sessions;
}

final class SessionReadyMessage extends ServerMessage {
  const SessionReadyMessage(this.sessionId, this.model, this.messages);
  final String sessionId;
  final String model;
  final List<Object?> messages;
}

final class SessionSwitchedMessage extends ServerMessage {
  const SessionSwitchedMessage(this.sessionId, this.model, this.messages);
  final String sessionId;
  final String model;
  final List<Object?> messages;
}

final class SessionDeletedMessage extends ServerMessage {
  const SessionDeletedMessage(this.sessionId);
  final String sessionId;
}

final class ErrorMessage extends ServerMessage {
  const ErrorMessage(this.message);
  final String message;
}

final class AgentStartMessage extends ServerMessage {
  const AgentStartMessage();
}

final class AgentSettledMessage extends ServerMessage {
  const AgentSettledMessage();
}

final class TurnStartMessage extends ServerMessage {
  const TurnStartMessage();
}

final class TurnEndMessage extends ServerMessage {
  const TurnEndMessage();
}

final class AgentEndMessage extends ServerMessage {
  const AgentEndMessage();
}

final class MessageUpdateMessage extends ServerMessage {
  const MessageUpdateMessage({required this.isTextDelta, required this.delta});
  final bool isTextDelta;
  final String delta;
}

final class ToolExecutionStartMessage extends ServerMessage {
  const ToolExecutionStartMessage(this.toolCallId, this.toolName, this.args);
  final String toolCallId;
  final String toolName;
  final Object? args;
}

final class ToolExecutionUpdateMessage extends ServerMessage {
  const ToolExecutionUpdateMessage(this.toolCallId, this.toolName, this.partialResult);
  final String toolCallId;
  final String toolName;
  final String partialResult;
}

final class ToolExecutionEndMessage extends ServerMessage {
  const ToolExecutionEndMessage(this.toolCallId, this.toolName, this.result, this.isError);
  final String toolCallId;
  final String toolName;
  final String result;
  final bool isError;
}
```

- [ ] **Step 3: 写渲染模型文件**

`apps/mobile/lib/features/ai/ai_models.dart`：

```dart
// 渲染层模型：服务端数据均来自 WS 事件，不做网络请求。
import 'dart:async';

class SessionItem {
  const SessionItem({
    required this.id,
    required this.name,
    required this.messageCount,
    required this.modified,
  });

  factory SessionItem.fromJson(Map<String, Object?> json) => SessionItem(
        id: json['id'] as String,
        name: (json['name'] as String?) ?? '',
        messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
        modified: (json['modified'] as String?) ?? '',
      );

  final String id;
  final String name;
  final int messageCount;
  final String modified;
}

class RenderToolCall {
  const RenderToolCall({
    required this.id,
    required this.name,
    required this.args,
    required this.result,
    required this.isError,
  });

  final String id;
  final String name;
  final Object? args;
  final String result;
  final bool isError;
}

class RenderMessage {
  const RenderMessage({
    required this.role,
    required this.text,
    required this.thinking,
    required this.toolCalls,
  });

  /// 与后端 toRenderMessages 输出对齐；role 取 'user' | 'assistant'。
  factory RenderMessage.fromJson(Map<String, Object?> json) {
    final toolCalls = <RenderToolCall>[];
    for (final raw in (json['toolCalls'] as List? ?? const [])) {
      if (raw is! Map<String, Object?>) continue;
      toolCalls.add(RenderToolCall(
        id: raw['id'] as String? ?? '',
        name: raw['name'] as String? ?? '',
        args: raw['args'],
        result: raw['result'] as String? ?? '',
        isError: raw['isError'] as bool? ?? false,
      ));
    }
    return RenderMessage(
      role: json['role'] as String? ?? 'assistant',
      text: json['text'] as String? ?? '',
      thinking: json['thinking'] as String? ?? '',
      toolCalls: toolCalls,
    );
  }

  final String role;
  final String text;
  final String thinking;
  final List<RenderToolCall> toolCalls;
}

class ToolCardState {
  const ToolCardState({
    required this.id,
    required this.name,
    required this.args,
    required this.result,
    required this.isError,
    required this.running,
  });

  final String id;
  final String name;
  final Object? args;
  final String result;
  final bool isError;
  final bool running;
}

/// 当前进行中的 AI 轮次。字段可变（在 Notifier 内就地更新后整体替换 state
/// 触发重建）；textController 为流式渲染增量通道，id 不变则实例不变。
class TurnState {
  TurnState(this.id) : textController = StreamController<String>();

  final int id;
  final StreamController<String> textController;
  String thinking = '';
  String text = '';
  final Map<String, ToolCardState> toolCards = {};

  bool get isEmpty => text.isEmpty && thinking.isEmpty && toolCards.isEmpty;

  void close() => textController.close();
}
```

- [ ] **Step 4: 写协议解析单测**

`apps/mobile/test/features/ai/ai_protocol_test.dart`：

```dart
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_protocol.dart';

void main() {
  group('ServerMessage.fromJson', () {
    test('sessions 列表解析', () {
      final msg = ServerMessage.fromJson(jsonDecode('''
        {"type":"sessions","sessions":[
          {"id":"s1","name":"今日计划","messageCount":3,"modified":"2026-08-10T10:00:00Z"}
        ]}
      '''));
      expect(msg, isA<SessionsMessage>());
      final m = msg! as SessionsMessage;
      expect(m.sessions.single.id, 's1');
      expect(m.sessions.single.messageCount, 3);
    });

    test('session_ready 保留原始 messages 列表', () {
      final msg = ServerMessage.fromJson(jsonDecode(
          '{"type":"session_ready","sessionId":"s1","model":"opencode-go/deepseek-v4-flash","messages":[{"role":"user","text":"hi","thinking":"","toolCalls":[]}]}'));
      final m = msg! as SessionReadyMessage;
      expect(m.sessionId, 's1');
      expect(m.model, 'opencode-go/deepseek-v4-flash');
      expect(m.messages.length, 1);
    });

    test('message_update 区分 text_delta / thinking_delta', () {
      final text = ServerMessage.fromJson(jsonDecode(
          '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"你好"}}'))! as MessageUpdateMessage;
      expect(text.isTextDelta, isTrue);
      expect(text.delta, '你好');

      final think = ServerMessage.fromJson(jsonDecode(
          '{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","delta":"让我想想"}}'))! as MessageUpdateMessage;
      expect(think.isTextDelta, isFalse);
      expect(think.delta, '让我想想');
    });

    test('工具事件解析', () {
      final start = ServerMessage.fromJson(jsonDecode(
          '{"type":"tool_execution_start","toolCallId":"t1","toolName":"list_tasks","args":{"groupId":"g1"}}'))! as ToolExecutionStartMessage;
      expect(start.toolCallId, 't1');
      expect((start.args as Map)['groupId'], 'g1');

      final end = ServerMessage.fromJson(jsonDecode(
          '{"type":"tool_execution_end","toolCallId":"t1","toolName":"list_tasks","result":"[]","isError":true}'))! as ToolExecutionEndMessage;
      expect(end.isError, isTrue);
      expect(end.result, '[]');
    });

    test('未知 type / 坏结构返回 null', () {
      expect(ServerMessage.fromJson(jsonDecode('{"type":"nope"}')), isNull);
      expect(ServerMessage.fromJson(jsonDecode('{"type":"message_update","assistantMessageEvent":{"type":"x","delta":"y"}}')), isNull);
      expect(ServerMessage.fromJson('not json'), isNull);
      expect(ServerMessage.fromJson(null), isNull);
    });
  });

  group('ClientMessage.toJson', () {
    test('type 与字段名对齐后端协议', () {
      expect(jsonEncode(const ClientPrompt('hi')), '{"type":"prompt","text":"hi"}');
      expect(jsonEncode(const ClientSwitchSession('s1')),
          '{"type":"switch_session","sessionId":"s1"}');
      expect(jsonEncode(const ClientAbort()), '{"type":"abort"}');
      expect(jsonEncode(const ClientDeleteSession('s1')),
          '{"type":"delete_session","sessionId":"s1"}');
    });
  });
}
```

- [ ] **Step 5: 写渲染模型单测**

`apps/mobile/test/features/ai/ai_models_test.dart`：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';

void main() {
  test('RenderMessage.fromJson：字段对齐 + toolCalls 过滤坏条目', () {
    final m = RenderMessage.fromJson({
      'role': 'assistant',
      'text': '完成',
      'thinking': '先查任务',
      'toolCalls': [
        {'id': 't1', 'name': 'list_tasks', 'args': {}, 'result': '[]', 'isError': false},
        'junk',
      ],
    });
    expect(m.role, 'assistant');
    expect(m.text, '完成');
    expect(m.thinking, '先查任务');
    expect(m.toolCalls.length, 1);
    expect(m.toolCalls.single.name, 'list_tasks');
  });

  test('RenderMessage.fromJson：缺字段回退默认值', () {
    final m = RenderMessage.fromJson({'role': 'user'});
    expect(m.text, '');
    expect(m.thinking, '');
    expect(m.toolCalls, isEmpty);
  });

  test('SessionItem.fromJson', () {
    final s = SessionItem.fromJson(
        {'id': 's1', 'name': '今日', 'messageCount': 2, 'modified': '2026-08-10T00:00:00Z'});
    expect(s.name, '今日');
    expect(s.messageCount, 2);
  });

  test('TurnState：isEmpty 与 close', () {
    final t = TurnState(1);
    expect(t.isEmpty, isTrue);
    t.text = 'x';
    expect(t.isEmpty, isFalse);
    t.close();
  });
}
```

- [ ] **Step 6: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/ai/ai_protocol_test.dart test/features/ai/ai_models_test.dart
```

期望：全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/mobile/pubspec.yaml apps/mobile/pubspec.lock apps/mobile/lib/features/ai/ai_protocol.dart apps/mobile/lib/features/ai/ai_models.dart apps/mobile/test/features/ai/
git commit -m "feat(mobile): add AI module deps, WS protocol types and render models"
```

---

### Task 2: AiClient（WS 连接封装）

**Files:**
- Create: `apps/mobile/lib/features/ai/ai_client.dart`
- Test: `apps/mobile/test/features/ai/ai_client_test.dart`

**Interfaces:**
- Consumes: `ClientMessage` / `ServerMessage.fromJson`（Task 1）。
- Produces:
  - `enum AiConnStatus { connecting, online, offline }`
  - `typedef WsChannelFactory = WebSocketChannel Function(Uri uri, Map<String, String> headers)`
  - `class AiClient { AiClient({required String baseUrl, required String? Function() tokenReader, WsChannelFactory? channelFactory}); String get wsUrl; Stream<ServerMessage> get messages; Stream<AiConnStatus> get statusStream; AiConnStatus get status; String? get lastError; Future<void> connect(); void send(ClientMessage msg); void close(); }`
  - `connect()` 幂等（已连接/连接中不重建）；握手失败置 offline + lastError；断开（onDone/onError）置 offline。

- [ ] **Step 1: 写客户端**

`apps/mobile/lib/features/ai/ai_client.dart`：

```dart
// 宁序 WS 客户端：URL 派生、Bearer 认证握手、收发、连接状态。
// 状态语义：connecting（握手进行中）/ online（可收发）/ offline（断开或失败）。
// 通道工厂可注入（测试用假通道），生产默认 IOWebSocketChannel。
import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'ai_protocol.dart';

enum AiConnStatus { connecting, online, offline }

typedef WsChannelFactory =
    WebSocketChannel Function(Uri uri, Map<String, String> headers);

class AiClient {
  AiClient({
    required this.baseUrl,
    required this.tokenReader,
    WsChannelFactory? channelFactory,
  }) : _factory =
            channelFactory ??
            ((uri, headers) => IOWebSocketChannel.connect(uri, headers: headers));

  final String baseUrl;
  final String? Function() tokenReader;
  final WsChannelFactory _factory;

  final StreamController<ServerMessage> _messages =
      StreamController<ServerMessage>.broadcast();
  final StreamController<AiConnStatus> _status =
      StreamController<AiConnStatus>.broadcast();

  WebSocketChannel? _channel;
  StreamSubscription<Object?>? _sub;
  AiConnStatus _statusValue = AiConnStatus.offline;
  String? _lastError;

  Stream<ServerMessage> get messages => _messages.stream;
  Stream<AiConnStatus> get statusStream => _status.stream;
  AiConnStatus get status => _statusValue;
  String? get lastError => _lastError;

  /// 派生 ws:// URL：http(s)→ws(s)，路径 /api/ai/ws（镜像 Web ws-url.ts）。
  String get wsUrl {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return '${base.replaceFirst(RegExp('^http'), 'ws')}/api/ai/ws';
  }

  /// 幂等连接：已有通道（connecting/online）不重建。
  Future<void> connect() async {
    if (_channel != null) return;
    final token = tokenReader();
    final headers = <String, String>{
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
    _setStatus(AiConnStatus.connecting);
    try {
      final channel = _factory(Uri.parse(wsUrl), headers);
      _channel = channel;
      await channel.ready; // 握手：失败/401 在此抛错
      _setStatus(AiConnStatus.online);
      _sub = channel.stream.listen(_onData, onDone: _onClosed, onError: _onError);
    } catch (_) {
      _channel = null;
      _lastError = '无法连接服务器，请检查网络后重试';
      _setStatus(AiConnStatus.offline);
    }
  }

  void _onData(Object? data) {
    if (data is! String) return;
    final msg = ServerMessage.fromJson(_tryDecode(data));
    if (msg != null) _messages.add(msg);
  }

  Object? _tryDecode(String data) {
    try {
      return jsonDecode(data);
    } catch (_) {
      return null;
    }
  }

  void _onClosed() {
    _channel = null;
    _sub = null;
    _setStatus(AiConnStatus.offline);
  }

  void _onError(Object error, StackTrace st) {
    _channel = null;
    _sub = null;
    _lastError = '连接中断，请点击重试';
    _setStatus(AiConnStatus.offline);
  }

  void _setStatus(AiConnStatus s) {
    _statusValue = s;
    _status.add(s);
  }

  void send(ClientMessage msg) {
    final channel = _channel;
    if (channel == null) return;
    channel.sink.add(jsonEncode(msg.toJson()));
  }

  void close() {
    _sub?.cancel();
    _channel?.sink.close();
    _channel = null;
    _sub = null;
  }
}
```

- [ ] **Step 2: 写客户端单测（假通道）**

`apps/mobile/test/features/ai/ai_client_test.dart`：

```dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_protocol.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// 测试假 WS 通道：记录收到的 header/发送内容，可手动注入入站事件。
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

void main() {
  late Uri capturedUri;
  late Map<String, String> capturedHeaders;
  late FakeWsChannel channel;
  late AiClient client;

  AiClient buildClient({String? token}) {
    channel = FakeWsChannel();
    client = AiClient(
      baseUrl: 'https://api.example.com',
      tokenReader: () => token,
      channelFactory: (uri, headers) {
        capturedUri = uri;
        capturedHeaders = headers;
        return channel;
      },
    );
    return client;
  }

  test('wsUrl：http(s) → ws(s)，路径固定 /api/ai/ws', () {
    expect(buildClient().wsUrl, 'wss://api.example.com/api/ai/ws');
    final local = AiClient(baseUrl: 'http://192.168.1.5:3000', tokenReader: () => null);
    expect(local.wsUrl, 'ws://192.168.1.5:3000/api/ai/ws');
    final trailing = AiClient(baseUrl: 'https://api.example.com/', tokenReader: () => null);
    expect(trailing.wsUrl, 'wss://api.example.com/api/ai/ws');
  });

  test('握手注入 Bearer header；无 token 不带 Authorization', () async {
    await buildClient(token: 'abc').connect();
    expect(capturedUri.toString(), 'wss://api.example.com/api/ai/ws');
    expect(capturedHeaders['Authorization'], 'Bearer abc');
    expect(client.status, AiConnStatus.online);

    await buildClient().connect();
    expect(capturedHeaders.containsKey('Authorization'), isFalse);
  });

  test('入站 JSON 解析为 ServerMessage；坏数据忽略', () async {
    await buildClient().connect();
    final got = <ServerMessage>[];
    client.messages.listen(got.add);

    channel.emit('not-json');
    channel.emit('{"type":"agent_start"}');
    channel.emit('{"type":"sessions","sessions":[]}');

    await Future<void>.delayed(Duration.zero);
    expect(got, hasLength(2));
    expect(got.first, isA<AgentStartMessage>());
    expect(got.last, isA<SessionsMessage>());
  });

  test('send 序列化后写入通道', () async {
    await buildClient().connect();
    client.send(const ClientPrompt('你好'));
    expect(jsonDecode(channel.sent.single as String),
        {'type': 'prompt', 'text': '你好'});
  });

  test('通道关闭 → offline；未连接 send 静默丢弃', () async {
    await buildClient().connect();
    expect(client.status, AiConnStatus.online);

    channel.closeIncoming();
    await Future<void>.delayed(Duration.zero);
    expect(client.status, AiConnStatus.offline);

    client.send(const ClientAbort());
    expect(channel.sent, isEmpty);
  });

  test('connect 幂等：已连接不重建通道', () async {
    await buildClient().connect();
    await client.connect();
    expect(client.status, AiConnStatus.online);
  });
}
```

- [ ] **Step 3: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/ai/ai_client_test.dart
```

期望：全部 PASS。

- [ ] **Step 4: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/ai/ai_client.dart apps/mobile/test/features/ai/ai_client_test.dart
git commit -m "feat(mobile): add AI WebSocket client with Bearer auth"
```

---

### Task 3: AiController（消息聚合 Notifier）+ providers

**Files:**
- Create: `apps/mobile/lib/features/ai/ai_controller.dart`
- Create: `apps/mobile/lib/features/ai/ai_providers.dart`
- Test: `apps/mobile/test/features/ai/ai_controller_test.dart`

**Interfaces:**
- Consumes: `AiClient` / `AiConnStatus`（Task 2）、`TurnState`/`RenderMessage`/`SessionItem`（Task 1）、`AppConfig.apiBaseUrl`、`authControllerProvider.token`。
- Produces:
  - `class AiState`：字段 `status / busy / lastError / currentSessionId / model / sessions / messages / activeTurn` + `copyWith(...)` + `const AiState.initial()`（status=offline）。
  - `final aiClientFactoryProvider = Provider<AiClient Function()>(...)`（测试可 override）。
  - `final aiControllerProvider = NotifierProvider<AiController, AiState>(AiController.new)`。
  - `class AiController extends Notifier<AiState>`：`Future<void> connect()`（幂等：非 offline 不重建）、`void send(String text)`、`void abort()`、`void newSession()`、`void switchSession(String id)`、`void deleteSession(String id)`、`void refreshSessions()`；内部 `_handleMessage(ServerMessage)` 聚合逻辑镜像 Web `ai-store.ts`。

- [ ] **Step 1: 写状态与控制器**

`apps/mobile/lib/features/ai/ai_controller.dart`：

```dart
// 宁序 AI 助手控制器：连接生命周期 + 消息流聚合（逻辑镜像 Web ai-store.ts）。
// 服务端数据均来自 WS 事件（server state），本控制器是唯一聚合点。
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'ai_client.dart';
import 'ai_models.dart';
import 'ai_providers.dart';
import 'ai_protocol.dart';

class AiState {
  const AiState({
    required this.status,
    required this.busy,
    required this.lastError,
    required this.currentSessionId,
    required this.model,
    required this.sessions,
    required this.messages,
    required this.activeTurn,
  });

  const AiState.initial()
      : status = AiConnStatus.offline,
        busy = false,
        lastError = null,
        currentSessionId = null,
        model = '',
        sessions = const [],
        messages = const [],
        activeTurn = null;

  final AiConnStatus status;
  final bool busy;

  /// 最近一次错误信息（error 事件或连接失败）；正常 agent_end 时清空。
  final String? lastError;
  final String? currentSessionId;
  final String model;
  final List<SessionItem> sessions;
  final List<RenderMessage> messages;
  final TurnState? activeTurn;

  AiState copyWith({
    AiConnStatus? status,
    bool? busy,
    String? lastError,
    bool clearError = false,
    String? currentSessionId,
    String? model,
    List<SessionItem>? sessions,
    List<RenderMessage>? messages,
    TurnState? activeTurn,
  }) {
    return AiState(
      status: status ?? this.status,
      busy: busy ?? this.busy,
      lastError: clearError ? null : (lastError ?? this.lastError),
      currentSessionId: currentSessionId ?? this.currentSessionId,
      model: model ?? this.model,
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      activeTurn: activeTurn ?? this.activeTurn,
    );
  }
}

class AiController extends Notifier<AiState> {
  AiClient? _client;
  StreamSubscription<ServerMessage>? _sub;
  StreamSubscription<AiConnStatus>? _statusSub;
  int _turnSeq = 0;

  @override
  AiState build() {
    ref.onDispose(_teardown);
    return const AiState.initial();
  }

  void _teardown() {
    _sub?.cancel();
    _statusSub?.cancel();
    _client?.close();
    _sub = null;
    _statusSub = null;
    _client = null;
  }

  /// 幂等：非 offline（连接中/在线）不重建连接。
  Future<void> connect() async {
    if (state.status != AiConnStatus.offline) return;
    _teardown();
    final client = ref.read(aiClientFactoryProvider)();
    _client = client;
    _sub = client.messages.listen(_handleMessage);
    _statusSub = client.statusStream.listen((s) {
      state = state.copyWith(status: s);
    });
    state = state.copyWith(status: AiConnStatus.connecting, lastError: null, clearError: true);
    await client.connect();
  }

  void _handleMessage(ServerMessage ev) {
    switch (ev) {
      case SessionReadyMessage():
      case SessionSwitchedMessage():
        _clearActiveTurn();
        state = state.copyWith(
          currentSessionId: ev.sessionId,
          model: ev.model,
          messages: ev.messages
              .whereType<Map<String, Object?>>()
              .map(RenderMessage.fromJson)
              .toList(),
          busy: false,
          lastError: null,
          clearError: true,
        );
        refreshSessions();
      case SessionsMessage():
        state = state.copyWith(sessions: ev.sessions);
      case SessionDeletedMessage():
        refreshSessions();
      case ErrorMessage():
        state = state.copyWith(busy: false, lastError: ev.message);
      case AgentStartMessage():
        state = state.copyWith(busy: true);
      case AgentEndMessage():
        state = state.copyWith(busy: false, lastError: null, clearError: true);
        _pushAssistantTurn();
      case TurnStartMessage():
        state = state.copyWith(activeTurn: TurnState(++_turnSeq));
      case TurnEndMessage():
        _pushAssistantTurn();
      case MessageUpdateMessage():
        final turn = state.activeTurn ?? TurnState(++_turnSeq);
        if (ev.isTextDelta) {
          turn.text += ev.delta;
          turn.textController.add(ev.delta);
        } else {
          turn.thinking += ev.delta;
        }
        state = state.copyWith(activeTurn: turn);
      case ToolExecutionStartMessage():
        final turn = state.activeTurn ?? TurnState(++_turnSeq);
        turn.toolCards[ev.toolCallId] = ToolCardState(
          id: ev.toolCallId,
          name: ev.toolName,
          args: ev.args,
          result: '',
          isError: false,
          running: true,
        );
        state = state.copyWith(activeTurn: turn);
      case ToolExecutionUpdateMessage():
        final turn = state.activeTurn;
        final card = turn?.toolCards[ev.toolCallId];
        if (turn == null || card == null) return;
        turn.toolCards[ev.toolCallId] = ToolCardState(
          id: card.id,
          name: card.name,
          args: card.args,
          result: card.result + ev.partialResult,
          isError: card.isError,
          running: card.running,
        );
        state = state.copyWith(activeTurn: turn);
      case ToolExecutionEndMessage():
        final turn = state.activeTurn;
        final card = turn?.toolCards[ev.toolCallId];
        if (turn == null || card == null) return;
        turn.toolCards[ev.toolCallId] = ToolCardState(
          id: card.id,
          name: card.name,
          args: card.args,
          result: (card.result.isNotEmpty ? '${card.result}\n' : '') + ev.result,
          isError: ev.isError,
          running: false,
        );
        state = state.copyWith(activeTurn: turn);
      case AgentSettledMessage():
        break; // 无需处理
    }
  }

  /// 归并当前轮：非空（有文本/思考/工具卡）追加到 messages；无论空否都重置
  /// activeTurn 并关闭其流式通道。turn_end（每轮必发）为主路径，agent_end 兜底。
  void _pushAssistantTurn() {
    final turn = state.activeTurn;
    if (turn == null) return;
    final m = RenderMessage(
      role: 'assistant',
      text: turn.text,
      thinking: turn.thinking,
      toolCalls: turn.toolCards.values
          .map((c) => RenderToolCall(
                id: c.id,
                name: c.name,
                args: c.args,
                result: c.result,
                isError: c.isError,
              ))
          .toList(),
    );
    final appended = !m.text.isEmpty || !m.thinking.isEmpty || m.toolCalls.isNotEmpty;
    turn.close();
    state = state.copyWith(
      messages: appended ? [...state.messages, m] : state.messages,
      activeTurn: null,
    );
  }

  void _clearActiveTurn() {
    state.activeTurn?.close();
    state = state.copyWith(activeTurn: null);
  }

  void send(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    // 乐观追加：后端事件流无 user 回显，不本地追加则实时对话中用户消息不显示。
    final userMsg = RenderMessage(
      role: 'user',
      text: trimmed,
      thinking: '',
      toolCalls: const [],
    );
    state = state.copyWith(messages: [...state.messages, userMsg]);
    _client?.send(ClientPrompt(trimmed));
  }

  void abort() => _client?.send(const ClientAbort());
  void newSession() => _client?.send(const ClientNewSession());
  void switchSession(String id) => _client?.send(ClientSwitchSession(id));
  void deleteSession(String id) => _client?.send(ClientDeleteSession(id));
  void refreshSessions() => _client?.send(const ClientListSessions());
}
```

注意：`copyWith` 的 `lastError` 参数语义——传 `clearError: true` 清空、传 `lastError: null` 保持、传具体值设置。上述代码里 `clearError: true` 与 `lastError: null` 同时传时清空生效。

- [ ] **Step 2: 写 providers**

`apps/mobile/lib/features/ai/ai_providers.dart`：

```dart
// AI 模块 provider 定义。客户端工厂可被测试 override（注入假通道）。
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/config.dart';
import '../auth/auth_providers.dart';
import 'ai_client.dart';
import 'ai_controller.dart';

final aiClientFactoryProvider = Provider<AiClient Function()>((ref) {
  return () => AiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenReader: () => ref.read(authControllerProvider).token,
  );
});

final aiControllerProvider =
    NotifierProvider<AiController, AiState>(AiController.new);
```

- [ ] **Step 3: 写控制器单测（假通道驱动事件序列）**

`apps/mobile/test/features/ai/ai_controller_test.dart`：

```dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_controller.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

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

    expect(streamed, ['你好', '，世界']);
    expect(h.state.messages, hasLength(1));
    final m = h.state.messages.single;
    expect(m.role, 'assistant');
    expect(m.text, '你好，世界');
    expect(m.toolCalls.single.id, 't1');
    expect(m.toolCalls.single.result, '{"items":[]}');
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

    expect(h.state.messages, hasLength(1));
    expect(h.state.messages.single.thinking, '想一下');
    expect(h.state.messages.single.text, '');
  });

  test('agent_start/agent_end：busy 切换 + agent_end 兜底归并', () async {
    final h = TestHarness();
    addTearDown(h.container.dispose);
    await h.connect();

    h.channel.emit(jsonEncode({'type': 'agent_start'}));
    expect(h.state.busy, isTrue);
    h.channel.emit(jsonEncode({'type': 'turn_start'}));
    h.channel.emit(jsonEncode({
      'type': 'message_update',
      'assistantMessageEvent': {'type': 'text_delta', 'delta': 'ok'},
    }));
    h.channel.emit(jsonEncode({'type': 'agent_end'}));
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
    expect(h.state.busy, isFalse);
    expect(h.state.lastError, '模型超时');

    h.channel.emit(jsonEncode({'type': 'agent_end'}));
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
    expect(h.channels, hasLength(2));
    expect(h.state.status, AiConnStatus.online);
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd apps/mobile
flutter test test/features/ai/ai_controller_test.dart
```

期望：全部 PASS（注意 `TestHarness.connect` 直接 `await notifier.connect()`，因为假通道握手立即完成；若出现 pending timer 报错，在测试末尾补 `await tester.pump()` 或改用 `pumpEventQueue()`——本套假通道无定时器，不应触发）。

- [ ] **Step 5: analyze + 提交**

```bash
cd apps/mobile
flutter analyze
git add apps/mobile/lib/features/ai/ai_controller.dart apps/mobile/lib/features/ai/ai_providers.dart apps/mobile/test/features/ai/ai_controller_test.dart
git commit -m "feat(mobile): add AI chat state controller"
```

---

### Task 4: 聊天 UI 组件（工具卡 / 思考块 / 消息流 / 输入栏）

**Files:**
- Create: `apps/mobile/lib/features/ai/widgets/tool_card.dart`
- Create: `apps/mobile/lib/features/ai/widgets/assistant_message.dart`（含 ThinkingBlock + ActiveTurnView + AssistantMessageView）
- Create: `apps/mobile/lib/features/ai/widgets/message_list.dart`
- Create: `apps/mobile/lib/features/ai/widgets/composer_bar.dart`
- Test: `apps/mobile/test/features/ai/tool_card_test.dart`
- Test: `apps/mobile/test/features/ai/message_list_test.dart`
- Test: `apps/mobile/test/features/ai/composer_bar_test.dart`

**Interfaces:**
- Consumes: `aiControllerProvider`（Task 3）、`TurnState`/`ToolCardState`/`RenderMessage`（Task 1）。
- Produces: `MessageList`（ConsumerWidget）、`ComposerBar`（ConsumerStatefulWidget）、`ToolCard({required ToolCardState card})`、`ActiveTurnView({required TurnState turn})`、`AssistantMessageView({required RenderMessage message})`。

- [ ] **Step 1: 写工具卡组件**

`apps/mobile/lib/features/ai/widgets/tool_card.dart`：

```dart
// 工具调用卡片：工具名 + 状态（运行中/成功/失败）+ 参数与结果（可展开）。
import 'package:flutter/material.dart';
import '../ai_models.dart';

class ToolCard extends StatelessWidget {
  const ToolCard({super.key, required this.card});

  final ToolCardState card;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Widget status = card.running
        ? const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Icon(
            card.isError ? Icons.error_outline : Icons.check_circle_outline,
            size: 16,
            color: card.isError ? scheme.error : scheme.primary,
          );

    final argsText = _stringify(card.args);

    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Icon(Icons.auto_awesome, size: 16, color: scheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    card.name,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                status,
              ],
            ),
          ),
          if (argsText.isNotEmpty)
            _CollapsibleRow(title: '参数', content: argsText),
          if (card.result.isNotEmpty)
            _CollapsibleRow(
              title: '结果',
              content: card.result,
              error: card.isError,
            ),
        ],
      ),
    );
  }

  static String _stringify(Object? value) {
    if (value == null) return '';
    if (value is String) return value;
    try {
      return const JsonEncoder.withIndent('  ').convert(value);
    } catch (_) {
      return value.toString();
    }
  }
}

class _CollapsibleRow extends StatelessWidget {
  const _CollapsibleRow({required this.title, required this.content, this.error = false});

  final String title;
  final String content;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        dense: true,
        shape: const Border(),
        collapsedShape: const Border(),
        title: Text(
          title,
          style: TextStyle(
            fontSize: 12,
            color: error ? scheme.error : scheme.onSurfaceVariant,
          ),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Text(
                content,
                style: TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: error ? scheme.error : scheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

注意：`JsonEncoder` 需要 `import 'dart:convert';`——把 `static String _stringify` 里的 `JsonEncoder` 用 `dart:convert` 导入补上（文件头部加 `import 'dart:convert';`）。

- [ ] **Step 2: 写思考块 + 消息渲染组件**

`apps/mobile/lib/features/ai/widgets/assistant_message.dart`：

```dart
// 助手消息渲染：thinking 折叠块 + Markdown 正文（历史静态 / 当前轮流式）+ 工具卡。
import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_markdown_stream/flutter_markdown_stream.dart';
import 'package:url_launcher/url_launcher.dart';
import '../ai_models.dart';
import 'tool_card.dart';

/// 思考过程折叠块（默认折叠，对齐 Web）。
class ThinkingBlock extends StatelessWidget {
  const ThinkingBlock({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        dense: true,
        shape: const Border(),
        collapsedShape: const Border(),
        leading: Icon(Icons.psychology_outlined, size: 18, color: scheme.onSurfaceVariant),
        title: Text(
          '思考过程',
          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                text,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

void _openLink(String text, String? href, String title) {
  if (href != null) launchUrl(Uri.parse(href));
}

/// 当前轮（流式中）：thinking + （无正文时「AI 正在思考…」指示，否则流式 Markdown）+ 工具卡。
class ActiveTurnView extends StatelessWidget {
  const ActiveTurnView({super.key, required this.turn});

  final TurnState turn;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        ThinkingBlock(text: turn.thinking),
        if (turn.text.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 8),
                Text(
                  'AI 正在思考…',
                  style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          )
        else
          MarkdownStream(
            stream: turn.textController.stream,
            onTapLink: _openLink,
            styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)),
          ),
        ...turn.toolCards.values.map((c) => ToolCard(card: c)),
      ],
    );
  }
}

/// 历史助手消息（已完整）：静态 Markdown 渲染。
class AssistantMessageView extends StatelessWidget {
  const AssistantMessageView({super.key, required this.message});

  final RenderMessage message;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        ThinkingBlock(text: message.thinking),
        MarkdownBody(
          data: message.text,
          onTapLink: _openLink,
          styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)),
        ),
        ...message.toolCalls
            .map((tc) => ToolCard(
                  card: ToolCardState(
                    id: tc.id,
                    name: tc.name,
                    args: tc.args,
                    result: tc.result,
                    isError: tc.isError,
                    running: false,
                  ),
                )),
      ],
    );
  }
}
```

- [ ] **Step 3: 写消息流组件**

`apps/mobile/lib/features/ai/widgets/message_list.dart`：

```dart
// 消息流：user 右对齐气泡 / assistant 左对齐 markdown；新内容自动滚底。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';
import 'assistant_message.dart';

class MessageList extends ConsumerStatefulWidget {
  const MessageList({super.key});

  @override
  ConsumerState<MessageList> createState() => _MessageListState();
}

class _MessageListState extends ConsumerState<MessageList> {
  final ScrollController _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(aiControllerProvider.select((s) => s.messages));
    final activeTurn = ref.watch(aiControllerProvider.select((s) => s.activeTurn));
    final turnText = ref.watch(aiControllerProvider.select((s) => s.activeTurn?.text));

    ref.listen(aiControllerProvider.select((s) => s.messages.length), (_, __) {
      _scrollToBottom();
    });
    ref.listen(aiControllerProvider.select((s) => s.activeTurn?.text), (_, __) {
      _scrollToBottom();
    });
    // activeTurn 实例变化（含 turnText 相同但工具卡新增）也滚底
    ref.listen(aiControllerProvider.select((s) => s.activeTurn?.toolCards.length), (_, __) {
      _scrollToBottom();
    });

    final scheme = Theme.of(context).colorScheme;

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: messages.length + (activeTurn != null ? 1 : 0),
      itemBuilder: (context, index) {
        if (activeTurn != null && index == messages.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: ActiveTurnView(turn: activeTurn),
          );
        }
        final m = messages[index];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: m.role == 'user'
              ? Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 320),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(m.text, style: const TextStyle(fontSize: 14)),
                  ),
                )
              : Align(
                  alignment: Alignment.centerLeft,
                  child: AssistantMessageView(message: m),
                ),
        );
      },
    );
  }
}
```

- [ ] **Step 4: 写输入栏组件**

`apps/mobile/lib/features/ai/widgets/composer_bar.dart`：

```dart
// 输入区：多行输入 + 发送/停止按钮。
// - 空闲：发送按钮；AI 回复中：输入框禁用 + 停止按钮（abort）。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';

class ComposerBar extends ConsumerStatefulWidget {
  const ComposerBar({super.key});

  @override
  ConsumerState<ComposerBar> createState() => _ComposerBarState();
}

class _ComposerBarState extends ConsumerState<ComposerBar> {
  final TextEditingController _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send() {
    final notifier = ref.read(aiControllerProvider.notifier);
    final text = _input.text.trim();
    if (text.isEmpty || ref.read(aiControllerProvider).busy) return;
    notifier.send(text);
    _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final busy = ref.watch(aiControllerProvider.select((s) => s.busy));
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                enabled: !busy,
                minLines: 1,
                maxLines: 4,
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: busy ? 'AI 正在回复…' : '输入消息',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                ),
              ),
            ),
            const SizedBox(width: 8),
            busy
                ? IconButton.filled(
                    tooltip: '停止',
                    icon: const Icon(Icons.stop, size: 20),
                    onPressed: () => ref.read(aiControllerProvider.notifier).abort(),
                  )
                : IconButton.filled(
                    tooltip: '发送',
                    icon: const Icon(Icons.send, size: 20),
                    onPressed: _send,
                  ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: 写 widget 测试（工具卡）**

`apps/mobile/test/features/ai/tool_card_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_models.dart';
import 'package:serenique_mobile/features/ai/widgets/tool_card.dart';

void main() {
  testWidgets('运行中：显示工具名与转圈', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1', name: 'list_tasks', args: {}, result: '', isError: false, running: true),
        ),
      ),
    ));
    expect(find.text('list_tasks'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('完成：显示勾与结果；展开可看参数', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1',
              name: 'create_task',
              args: {'title': '买牛奶'},
              result: '已创建',
              isError: false,
              running: false),
        ),
      ),
    ));
    expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
    await tester.tap(find.text('参数'));
    await tester.pumpAndSettle();
    expect(find.textContaining('买牛奶'), findsOneWidget);
  });

  testWidgets('失败：结果区红显 error 图标', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ToolCard(
          card: const ToolCardState(
              id: 't1',
              name: 'delete_task',
              args: {'id': 'x'},
              result: '删除失败',
              isError: true,
              running: false),
        ),
      ),
    ));
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
  });
}
```

- [ ] **Step 6: 写 widget 测试（消息流）**

`apps/mobile/test/features/ai/message_list_test.dart`：

```dart
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
  );
}

Widget host(ProviderContainer container) => UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: Scaffold(body: MessageList())),
    );

void main() {
  testWidgets('user 消息右对齐气泡；assistant 消息静态 markdown', (tester) async {
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => FakeAiController(stateWith(messages: [
            const RenderMessage(
                role: 'user', text: '你好', thinking: '', toolCalls: []),
            const RenderMessage(
                role: 'assistant', text: '**世界**', thinking: '', toolCalls: []),
          ]))),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('你好'), findsOneWidget);
    expect(find.text('世界'), findsOneWidget); // **世界** 渲染为粗体「世界」
  });

  testWidgets('activeTurn 无正文时显示「AI 正在思考…」', (tester) async {
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => FakeAiController(
            stateWith(activeTurn: TurnState(1)),
          )),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('AI 正在思考…'), findsOneWidget);
  });

  testWidgets('activeTurn 有正文时渲染流式组件且不显示思考指示', (tester) async {
    final turn = TurnState(1);
    turn.text = '回答中';
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(
          () => FakeAiController(stateWith(activeTurn: turn))),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('AI 正在思考…'), findsNothing);
    // MarkdownStream 渲染出自定义组件（无自带类型名，用文本断言当前轮内容）
    expect(turn.textController.hasListener, isTrue);
  });

  testWidgets('思考折叠块：默认收起，点击展开', (tester) async {
    final container = ProviderContainer(overrides: [
      aiControllerProvider.overrideWith(() => FakeAiController(stateWith(messages: [
            const RenderMessage(
                role: 'assistant',
                text: '答案',
                thinking: '推理过程',
                toolCalls: []),
          ]))),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    expect(find.text('推理过程'), findsNothing);
    await tester.tap(find.text('思考过程'));
    await tester.pumpAndSettle();
    expect(find.text('推理过程'), findsOneWidget);
  });
}
```

- [ ] **Step 7: 写 widget 测试（输入栏）**

`apps/mobile/test/features/ai/composer_bar_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
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
```

注意：`RecordingAiController.send` 调用 `super.send` 会触发真实 AiController.send（乐观追加 state + 发 prompt）。AiController 未 connect 时 `_client` 为 null，`_client?.send` 静默跳过，安全。`super.abort()` 同理。

- [ ] **Step 8: 跑测试 + analyze**

```bash
cd apps/mobile
flutter test test/features/ai/
flutter analyze
```

期望：全部 PASS，analyze 无告警（若有 import 未用告警按提示删掉；`message_list_test` 中 `import 'ai_client.dart'` 仅用于 `AiConnStatus` 类型——确认保留 `AiConnStatus` 引用）。

- [ ] **Step 9: 提交**

```bash
git add apps/mobile/lib/features/ai/widgets/ apps/mobile/test/features/ai/tool_card_test.dart apps/mobile/test/features/ai/message_list_test.dart apps/mobile/test/features/ai/composer_bar_test.dart
git commit -m "feat(mobile): add AI chat UI widgets"
```

---

### Task 5: AI 页面接入（页面 / 会话弹层 / AppShell 标题 / 路由）

**Files:**
- Create: `apps/mobile/lib/features/ai/widgets/session_sheet.dart`
- Create: `apps/mobile/lib/features/ai/widgets/session_title.dart`
- Create: `apps/mobile/lib/features/ai/ai_page.dart`
- Modify: `apps/mobile/lib/router.dart`（`/ai` → `AiPage`）
- Modify: `apps/mobile/lib/app_shell.dart`（`/ai` 时 AppBar 标题 = `AiSessionTitle`）
- Test: `apps/mobile/test/features/ai/ai_page_test.dart`
- Test: `apps/mobile/test/features/ai/session_sheet_test.dart`
- Modify: `apps/mobile/test/router_test.dart`（加 `/ai` 渲染真实聊天页用例，overrides 注入假客户端）

**Interfaces:**
- Consumes: `aiControllerProvider` 全部 action（Task 3）、`MessageList`/`ComposerBar`（Task 4）。
- Produces: `AiPage`（ConsumerStatefulWidget，挂载 connect + AppLifecycleListener）、`Future<void> showSessionSheet(BuildContext context, WidgetRef ref)`、`AiSessionTitle`（ConsumerWidget，AppBar 会话名标题）。

- [ ] **Step 1: 写会话弹层**

`apps/mobile/lib/features/ai/widgets/session_sheet.dart`：

```dart
// 会话切换 bottom sheet：新建 / 切换 / 删除（删除需确认）。等价 Web 的 header 下拉。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';

Future<void> showSessionSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) {
      final sessions = ref.watch(aiControllerProvider.select((s) => s.sessions));
      final currentId = ref.watch(aiControllerProvider.select((s) => s.currentSessionId));
      final notifier = ref.read(aiControllerProvider.notifier);

      Future<void> confirmDelete(SessionItemName name) async {
        final ok = await showDialog<bool>(
          context: sheetContext,
          builder: (dctx) => AlertDialog(
            title: const Text('删除会话'),
            content: Text('删除会话「$name」？此操作不可恢复。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dctx, false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dctx, true),
                child: const Text('删除'),
              ),
            ],
          ),
        );
        if (ok == true && sheetContext.mounted) Navigator.pop(sheetContext);
        if (ok == true) notifier.deleteSession(id);
      }

      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              leading: const Icon(Icons.add),
              title: const Text('新建会话'),
              onTap: () {
                Navigator.pop(sheetContext);
                notifier.newSession();
              },
            ),
            const Divider(height: 1),
            if (sessions.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('暂无会话', textAlign: TextAlign.center),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: sessions.length,
                  itemBuilder: (context, i) {
                    final s = sessions[i];
                    final selected = s.id == currentId;
                    return ListTile(
                      selected: selected,
                      selectedTileColor:
                          Theme.of(context).colorScheme.secondaryContainer.withValues(alpha: 0.4),
                      title: Text(s.name, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${s.messageCount} 条消息'),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        tooltip: '删除会话',
                        onPressed: () => confirmDelete(s.name),
                      ),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        if (s.id != currentId) notifier.switchSession(s.id);
                      },
                    );
                  },
                ),
              ),
          ],
        ),
      );
    },
  );
}

typedef SessionItemName = String;
```

注意：`confirmDelete` 里 `notifier.deleteSession(id)` 闭包捕获的 `id` 来自 `itemBuilder` 的 `s`——把 `confirmDelete` 改成接收 `SessionItem`（`String id` + `String name`）避免闭包混淆：

```dart
Future<void> confirmDelete(String id, String name) async { ... notifier.deleteSession(id); }
...
onPressed: () => confirmDelete(s.id, s.name),
```

（实现时以上方改法为准，删除 `typedef SessionItemName`。）

- [ ] **Step 2: 写 AppBar 会话标题**

`apps/mobile/lib/features/ai/widgets/session_title.dart`：

```dart
// AppBar 会话切换标题（AppShell 对 /ai 渲染）：宁序 + 当前会话名（▾），点击弹会话列表。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ai_providers.dart';
import 'session_sheet.dart';

class AiSessionTitle extends ConsumerWidget {
  const AiSessionTitle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(aiControllerProvider.select((s) => s.sessions));
    final currentId = ref.watch(aiControllerProvider.select((s) => s.currentSessionId));
    final name = sessions.where((s) => s.id == currentId).map((s) => s.name).firstOrNull ?? '新会话';

    return InkWell(
      onTap: () => showSessionSheet(context, ref),
      borderRadius: BorderRadius.circular(8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('宁序'),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: Text(
              name,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
          const Icon(Icons.arrow_drop_down, size: 20),
        ],
      ),
    );
  }
}
```

`firstOrNull` 来自 `package:collection`（已是 pubspec 依赖）。

- [ ] **Step 3: 写 AI 页面**

`apps/mobile/lib/features/ai/ai_page.dart`：

```dart
// 宁序 AI 助手页：消息流 + 输入栏 + 离线横幅 + 错误提示。
// 挂载即连接（幂等）；App 回前台且离线时自动重连。
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'ai_client.dart';
import 'ai_providers.dart';
import 'widgets/composer_bar.dart';
import 'widgets/message_list.dart';

class AiPage extends ConsumerStatefulWidget {
  const AiPage({super.key});

  @override
  ConsumerState<AiPage> createState() => _AiPageState();
}

class _AiPageState extends ConsumerState<AiPage> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.read(aiControllerProvider.notifier).connect(),
    );
    // 首帧后连接（避免 build 期间读 state）
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(aiControllerProvider.notifier).connect();
    });
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(aiControllerProvider.select((s) => s.status));
    final lastError = ref.watch(aiControllerProvider.select((s) => s.lastError));

    ref.listen(aiControllerProvider.select((s) => s.lastError), (prev, next) {
      if (next == null || next == prev) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(next)));
    });

    return Column(
      children: [
        Expanded(child: MessageList()),
        if (status == AiConnStatus.offline)
          _OfflineBanner(
            onRetry: () => ref.read(aiControllerProvider.notifier).connect(),
          ),
        const ComposerBar(),
      ],
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Row(
          children: [
            Icon(Icons.cloud_off, size: 16, color: scheme.onErrorContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '连接已断开',
                style: TextStyle(fontSize: 13, color: scheme.onErrorContainer),
              ),
            ),
            TextButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: 改路由 + AppShell**

`apps/mobile/lib/router.dart`：

```dart
// 原行：GoRoute(path: '/ai', builder: (context, state) => const PlaceholderPage(title: '宁序', icon: Icons.auto_awesome)),
// 改为：
GoRoute(path: '/ai', builder: (context, state) => const AiPage()),
```

新增 import：`import 'features/ai/ai_page.dart';`

`apps/mobile/lib/app_shell.dart`：

```dart
// 原行：title: Text(moduleTitle(location)),
// 改为：
title: location.startsWith('/ai')
    ? const AiSessionTitle()
    : Text(moduleTitle(location)),
```

新增 import：`import 'features/ai/widgets/session_title.dart';`

- [ ] **Step 5: 写页面 widget 测试（真实控制器 + 假客户端）**

`apps/mobile/test/features/ai/ai_page_test.dart`：

```dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_page.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

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

void main() {
  ProviderContainer makeContainer(List<FakeWsChannel> channels) {
    return ProviderContainer(overrides: [
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

  Widget host(ProviderContainer container) => UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: Scaffold(body: AiPage())),
      );

  testWidgets('挂载自动连接；收到历史消息后渲染', (tester) async {
    final channels = <FakeWsChannel>[];
    final container = makeContainer(channels);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();
    expect(channels, hasLength(1));
    expect(container.read(aiControllerProvider).status, AiConnStatus.online);

    channels.single.emit(jsonEncode({
      'type': 'session_ready',
      'sessionId': 's1',
      'model': 'm',
      'messages': [
        {'role': 'user', 'text': '早上好', 'thinking': '', 'toolCalls': []},
      ],
    }));
    await tester.pump();
    expect(find.text('早上好'), findsOneWidget);
  });

  testWidgets('断线显示横幅；点重试建立新连接', (tester) async {
    final channels = <FakeWsChannel>[];
    final container = makeContainer(channels);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();
    expect(find.text('连接已断开'), findsNothing);

    channels.single.closeIncoming();
    await tester.pump();
    await tester.pump();
    expect(find.text('连接已断开'), findsOneWidget);

    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump();
    expect(channels, hasLength(2));
    expect(find.text('连接已断开'), findsNothing);
  });

  testWidgets('error 事件弹 SnackBar', (tester) async {
    final channels = <FakeWsChannel>[];
    final container = makeContainer(channels);
    addTearDown(container.dispose);

    await tester.pumpWidget(host(container));
    await tester.pump();

    channels.single.emit(jsonEncode({'type': 'error', 'message': '模型超时'}));
    await tester.pump();
    expect(find.text('模型超时'), findsOneWidget);
  });
}
```

- [ ] **Step 6: 写会话弹层 widget 测试**

`apps/mobile/test/features/ai/session_sheet_test.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
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
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showSessionSheet(context, container),
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
      child: Builder(
        builder: (context) => MaterialApp(
          home: Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showSessionSheet(context, container),
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
```

注意：`showSessionSheet` 内 `ref` 参数与 sheet 的 `sheetContext` 作用域——测试里直接把 `container` 传给 `ref`（`showSessionSheet(BuildContext, WidgetRef)` 的 `ref` 参数），可传 `container` 本体。

- [ ] **Step 7: 更新 router 测试**

`apps/mobile/test/router_test.dart` 末尾追加（照 /audit 用例模式）：

```dart
testWidgets('已登录：/ai 渲染真实聊天页（非占位）', (tester) async {
  final channels = <dynamic>[];
  final container = ProviderContainer(overrides: [
    tokenStorageProvider.overrideWithValue(FakeTokenStorage('secret')),
    momentListProvider.overrideWith((ref) async => const <Moment>[]),
    countsProvider.overrideWith((ref) async => 0),
    auditUnreadCountProvider.overrideWith((ref) async => 0),
    taskTodoCountProvider.overrideWith((ref) async => 0),
    aiClientFactoryProvider.overrideWithValue(() => AiClient(
          baseUrl: 'https://api.example.com',
          tokenReader: () => null,
          channelFactory: (uri, headers) {
            final ch = _AiFakeWsChannel();
            channels.add(ch);
            return ch;
          },
        )),
  ]);
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const App()));
  await tester.pumpAndSettle();

  container.read(appRouterProvider).go('/ai');
  await tester.pumpAndSettle();

  // 空态/输入框证明是真实聊天页（占位页只显示「功能开发中」）
  expect(find.byType(AiPage), findsOneWidget);
  expect(find.byType(TextField), findsOneWidget);
});
```

配套在文件头部新增 import：

```dart
import 'package:serenique_mobile/features/ai/ai_client.dart';
import 'package:serenique_mobile/features/ai/ai_page.dart';
import 'package:serenique_mobile/features/ai/ai_providers.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
```

并在该文件 `main()` 外补最小假通道（复用 Task 2 的 FakeWsChannel 结构，类名 `_AiFakeWsChannel`）：

```dart
class _AiFakeWsChannel implements WebSocketChannel {
  final _incoming = StreamController<Object?>.broadcast();
  @override
  Stream get stream => _incoming.stream;
  @override
  WebSocketSink get sink => _Sink(this);
  @override
  Future<void> get ready => Future.value();
  @override
  int? get closeCode => null;
  @override
  String? get closeReason => null;
  @override
  String? get protocol => null;
}

class _Sink implements WebSocketSink {
  _Sink(this._ch);
  final _AiFakeWsChannel _ch;
  @override
  void add(Object? data) {}
  @override
  void addError(Object error, [StackTrace? stackTrace]) {}
  @override
  Future<void> addStream(Stream stream) async {}
  @override
  Future<void> close([int? closeCode, String? closeReason]) async {}
  @override
  Future<void> get done => Future.value();
}
```

需要 `import 'dart:async';`（router_test.dart 头部）。

- [ ] **Step 8: 全量验证**

```bash
cd apps/mobile
flutter analyze
flutter test
```

期望：全部 PASS（含既有测试）。若 app_shell_test 对 AppBar 标题有断言且 /ai 标题变化影响它——检查其用例是否导航到 /ai；没有则不受影响。

- [ ] **Step 9: 提交**

```bash
git add apps/mobile/lib/features/ai/ apps/mobile/lib/router.dart apps/mobile/lib/app_shell.dart apps/mobile/test/features/ai/ apps/mobile/test/router_test.dart
git commit -m "feat(mobile): wire up AI chat page with session switching"
```

---

### Task 6: 收尾（记忆 + 状态更新）

**Files:**
- Create: `.ai/worklog/2026-08-10-flutter-ai-module.md`
- Modify: `.ai/requirements/2026-08-09-ai-agent-module.md`（移动端置 ✅已实施）
- Modify: `.ai/README.md`（若索引需要）

- [ ] **Step 1: 写 worklog**

`.ai/worklog/2026-08-10-flutter-ai-module.md`：按既有 worklog 格式（做了什么 / 验证 / 坑 / 对下一次会话的提示），记录：新增 4 依赖、features/ai 模块结构、流式方案（flutter_markdown_stream + 每轮 StreamController）、假通道测试模式（3 处 FakeWsChannel 复制的坑——建议下次抽到 test/helpers.dart）、真机手测清单（iOS 真机：连接/断线横幅/回前台重连/会话切换/停止回复/markdown 表格与代码块流式效果）。

- [ ] **Step 2: 更新需求状态**

`.ai/requirements/2026-08-09-ai-agent-module.md` 头部状态行：

```markdown
- 状态：✅已实施（后端 2026-08-09 + Web 前端 2026-08-09 + 移动端 2026-08-10 均完成）
```

- [ ] **Step 3: 提交**

```bash
git add .ai/worklog/2026-08-10-flutter-ai-module.md .ai/requirements/2026-08-09-ai-agent-module.md
git commit -m "docs: record flutter AI module implementation and mark requirement as done"
```

- [ ] **Step 4: 收尾动作**

把本计划文件移入 `.ai/archive/2026-08-10-flutter-ai-module-plan.md` 并提交：

```bash
git mv docs/superpowers/plans/2026-08-10-flutter-ai-module.md .ai/archive/2026-08-10-flutter-ai-module-plan.md
git commit -m "docs: archive flutter AI module implementation plan"
```

---

## Self-Review 记录

- **Spec 覆盖**：WS 协议（Task 1）、连接与 Bearer 认证（Task 2）、消息聚合含流式通道（Task 3）、思考折叠/工具卡/自动滚底/输入栏（Task 4）、会话弹层/AppBar 标题/路由/断线横幅/回前台重连/错误 SnackBar（Task 5）、测试门禁与记忆收尾（Task 6）。后端零改动 ✔。
- **占位符扫描**：无 TBD/TODO；所有步骤含完整代码或精确改动描述。
- **类型一致性**：`AiConnStatus`、`TurnState.textController`（`StreamController<String>`）、`copyWith(clearError:)` 语义在 Task 3-5 一致；`showSessionSheet(BuildContext, WidgetRef)` 签名在 Task 5 一致；FakeWsChannel 在 Task 2/3/5 与 router_test 中结构一致（均为最小实现）。
