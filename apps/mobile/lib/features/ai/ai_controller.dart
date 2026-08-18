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
    required this.hasMoreMessages,
    required this.loadingMore,
    required this.totalMessages,
  });

  const AiState.initial()
    : status = AiConnStatus.offline,
      busy = false,
      lastError = null,
      currentSessionId = null,
      model = '',
      sessions = const [],
      messages = const [],
      activeTurn = null,
      hasMoreMessages = false,
      loadingMore = false,
      totalMessages = 0;

  final AiConnStatus status;
  final bool busy;

  /// 最近一次错误信息（error 事件或连接失败）；正常 agent_end 时清空。
  final String? lastError;
  final String? currentSessionId;
  final String model;
  final List<SessionItem> sessions;
  final List<RenderMessage> messages;
  final TurnState? activeTurn;

  /// 是否还有更早的历史消息可加载（向上滚动懒加载）。
  final bool hasMoreMessages;

  /// 正在加载更早的消息（防并发重复请求）。
  final bool loadingMore;

  /// 当前会话渲染消息总数（来自后端 totalMessageCount）。
  final int totalMessages;

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
    bool clearActiveTurn = false,
    bool? hasMoreMessages,
    bool? loadingMore,
    int? totalMessages,
  }) {
    return AiState(
      status: status ?? this.status,
      busy: busy ?? this.busy,
      lastError: clearError ? null : (lastError ?? this.lastError),
      currentSessionId: currentSessionId ?? this.currentSessionId,
      model: model ?? this.model,
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      activeTurn: clearActiveTurn ? null : (activeTurn ?? this.activeTurn),
      hasMoreMessages: hasMoreMessages ?? this.hasMoreMessages,
      loadingMore: loadingMore ?? this.loadingMore,
      totalMessages: totalMessages ?? this.totalMessages,
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
    state = state.copyWith(
      status: AiConnStatus.connecting,
      lastError: null,
      clearError: true,
    );
    await client.connect();
  }

  void _handleMessage(ServerMessage ev) {
    switch (ev) {
      // 注意：零子模式的 `case SessionReadyMessage():` 在本 SDK 不产生类型提升
      // （会报 "getter isn't defined for ServerMessage"），因此改为字段绑定模式，
      // 共享 case 体内 sessionId/model/messages 为绑定局部变量，语义与原代码一致。
      case SessionReadyMessage(
        :final sessionId,
        :final model,
        :final messages,
        :final totalMessageCount,
        :final hasMore,
      ):
      case SessionSwitchedMessage(
        :final sessionId,
        :final model,
        :final messages,
        :final totalMessageCount,
        :final hasMore,
      ):
        _clearActiveTurn();
        state = state.copyWith(
          currentSessionId: sessionId,
          model: model,
          messages: messages
              .whereType<Map<String, Object?>>()
              .map(RenderMessage.fromJson)
              .toList(),
          busy: false,
          lastError: null,
          clearError: true,
          hasMoreMessages: hasMore,
          loadingMore: false,
          totalMessages: totalMessageCount,
        );
        refreshSessions();
      case MessagesLoadedMessage(
        :final messages,
        :final totalMessageCount,
        :final hasMore,
      ):
        // 向上滚动加载更早的消息：prepend 到 messages 前面。
        final older = messages
            .whereType<Map<String, Object?>>()
            .map(RenderMessage.fromJson)
            .toList();
        state = state.copyWith(
          messages: [...older, ...state.messages],
          loadingMore: false,
          hasMoreMessages: hasMore,
          totalMessages: totalMessageCount,
        );
      case SessionsMessage():
        state = state.copyWith(sessions: ev.sessions);
      case SessionDeletedMessage():
        refreshSessions();
      case ErrorMessage():
        // 复位 loadingMore：load_more 分支异常时收到 error 而非 messages_loaded，
        // 不置 false 会永久阻断后续懒加载。
        state = state.copyWith(busy: false, lastError: ev.message, loadingMore: false);
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
          result:
              (card.result.isNotEmpty ? '${card.result}\n' : '') + ev.result,
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
          .map(
            (c) => RenderToolCall(
              id: c.id,
              name: c.name,
              args: c.args,
              result: c.result,
              isError: c.isError,
            ),
          )
          .toList(),
    );
    final appended =
        m.text.isNotEmpty || m.thinking.isNotEmpty || m.toolCalls.isNotEmpty;
    turn.close();
    state = state.copyWith(
      messages: appended ? [...state.messages, m] : state.messages,
      activeTurn: null,
      clearActiveTurn: true,
    );
  }

  void _clearActiveTurn() {
    state.activeTurn?.close();
    state = state.copyWith(activeTurn: null, clearActiveTurn: true);
  }

  void send(String text) {
    // 未连接（connecting/offline）时禁止发送：AiClient.send 会静默丢弃，
    // 否则乐观追加的 user 消息永不送达（幽灵消息）。
    if (state.status != AiConnStatus.online) return;
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

  /// 向上滚动懒加载更早的消息。防并发：正在加载或无更多历史时不重复请求。
  void loadMore() {
    if (state.loadingMore || !state.hasMoreMessages) return;
    state = state.copyWith(loadingMore: true);
    _client?.send(const ClientLoadMore());
  }
}
