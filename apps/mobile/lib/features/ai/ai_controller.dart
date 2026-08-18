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
    required this.compacting,
    required this.resyncTick,
    this.compactionSummary,
    this.compactionTailStart = 0,
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
      totalMessages = 0,
      compacting = false,
      resyncTick = 0,
      compactionSummary = null,
      compactionTailStart = 0;

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

  /// 正在压缩会话上下文（compaction_start→end 之间）。
  final bool compacting;

  /// 分页重同步计数（评审 B1）：会话压缩后服务端下发 session_compacted 重建
  /// 分页基线。每次重同步 +1，供消息列表据此滚到底部而非当作 prepend 补偿。
  final int resyncTick;

  /// 压缩摘要文本（评审 B2）：session_compacted 下发的 summary。**不进 messages
  /// 数组、不算 total**（分页计数零扰动）；渲染层在 messages 的 compactionTailStart
  /// 下标处展示「已压缩早期对话」可展开卡片。null = 无压缩摘要卡片。
  final String? compactionSummary;

  /// 压缩摘要卡片应插入的本地数组下标：= session_compacted 时新尾页条数；
  /// load_more prepend 时前移 batch 长度（卡片保持在更早批次之后）。
  final int compactionTailStart;

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
    bool? compacting,
    int? resyncTick,
    String? compactionSummary,
    int? compactionTailStart,
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
      compacting: compacting ?? this.compacting,
      resyncTick: resyncTick ?? this.resyncTick,
      compactionSummary: compactionSummary ?? this.compactionSummary,
      compactionTailStart: compactionTailStart ?? this.compactionTailStart,
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
        _clearActiveTurn();
        state = state.copyWith(
          currentSessionId: sessionId,
          model: model,
          messages: _parseMessages(messages),
          busy: false,
          lastError: null,
          clearError: true,
          hasMoreMessages: hasMore,
          loadingMore: false,
          totalMessages: totalMessageCount,
          compacting: false,
          // 换会话/重建：压缩摘要卡片不跨会话残留（评审 B2）
          compactionSummary: null,
          compactionTailStart: 0,
        );
        refreshSessions();
      case SessionSwitchedMessage(
        :final sessionId,
        :final model,
        :final messages,
        :final totalMessageCount,
        :final hasMore,
        :final chainContinuation,
        :final marker,
      ):
        if (chainContinuation) {
          // 链延续（评审 B2/建议 1）：保留已加载时间线，仅插入边界 marker。
          // 后端本负载 messages=[]、total=0（新链尾尚无消息），不代表合并流整体，
          // 故 totalMessages/hasMoreMessages 保持不变，前端 anchor 继续有效。
          // marker 顺序（建议 1）：权威合并流是 [marker, 本轮 userMsg, ...]，而 send()
          // 乐观追加的 userMsg 已在末尾 → 把 marker 插到最后一个乐观 userMsg 之前。
          _clearActiveTurn();
          final current = List<RenderMessage>.from(state.messages);
          final markerMsg = RenderMessage(
            role: 'assistant',
            text: marker?.isNotEmpty == true ? marker! : '已开启新会话',
            thinking: '',
            toolCalls: const [],
            kind: 'system',
          );
          final lastOpt = current.lastIndexWhere((m) => m.optimistic);
          if (lastOpt >= 0) {
            final userMsg = current[lastOpt];
            current[lastOpt] = markerMsg;
            current.insert(
              lastOpt + 1,
              RenderMessage(
                role: userMsg.role,
                text: userMsg.text,
                thinking: userMsg.thinking,
                toolCalls: userMsg.toolCalls,
                kind: userMsg.kind,
                detail: userMsg.detail,
                optimistic: false, // 清除本地标记
              ),
            );
          } else {
            current.add(markerMsg);
          }
          state = state.copyWith(
            currentSessionId: sessionId,
            model: model,
            messages: current,
            busy: false,
            lastError: null,
            clearError: true,
            compacting: false,
          );
          return;
        }
        _clearActiveTurn();
        state = state.copyWith(
          currentSessionId: sessionId,
          model: model,
          messages: _parseMessages(messages),
          busy: false,
          lastError: null,
          clearError: true,
          hasMoreMessages: hasMore,
          loadingMore: false,
          totalMessages: totalMessageCount,
          compacting: false,
          // 完整切换（删除后重建等）：压缩摘要卡片不跨会话残留
          compactionSummary: null,
          compactionTailStart: 0,
        );
        refreshSessions();
      case SessionCompactedMessage(
        :final sessionId,
        :final messages,
        :final totalMessageCount,
        :final hasMore,
        :final summary,
      ):
        // 压缩重同步（评审 B1/B2）：重建分页基线。新尾页替换当前窗口；resyncTick
        // +1 供列表滚底而非 prepend 补偿。摘要文本存 compactionSummary（不并入
        // messages/total），渲染层在 messages[compactionTailStart] 展示卡片。
        _clearActiveTurn();
        final parsed = _parseMessages(messages);
        state = state.copyWith(
          currentSessionId: sessionId, // 评审建议 4：压缩重同步同步更新当前会话
          messages: parsed,
          totalMessages: totalMessageCount,
          hasMoreMessages: hasMore,
          loadingMore: false,
          busy: false,
          compacting: false,
          resyncTick: state.resyncTick + 1,
          compactionSummary:
              (summary?.trim().isNotEmpty ?? false) ? summary : null,
          compactionTailStart: parsed.length,
        );
        break;
      case CompactionStartMessage():
        state = state.copyWith(compacting: true);
        break;
      case CompactionEndMessage(:final errorMessage, :final aborted):
        // 复位压缩中状态。失败/中断透传提示（评审建议 2）：经 lastError → ai_page
        // SnackBar 展示。成功压缩的摘要由随后的 session_compacted 负责。
        final err = (errorMessage != null && errorMessage.isNotEmpty)
            ? errorMessage
            : null;
        if (err != null) {
          state = state.copyWith(compacting: false, lastError: '压缩失败：$err');
        } else if (aborted) {
          state = state.copyWith(compacting: false, lastError: '压缩已中断');
        } else {
          state = state.copyWith(compacting: false);
        }
        break;
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
          // 压缩摘要卡片相对位置（评审 B2）：prepend 后卡片保持在更早批次之后
          compactionTailStart: state.compactionTailStart + older.length,
        );
        break;
      case SessionsMessage():
        state = state.copyWith(sessions: ev.sessions);
      case SessionDeletedMessage():
        refreshSessions();
      case ErrorMessage():
        // 复位 loadingMore：load_more 分支异常时收到 error 而非 messages_loaded，
        // 不置 false 会永久阻断后续懒加载。
        state = state.copyWith(
          busy: false,
          lastError: ev.message,
          loadingMore: false,
        );
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

  /// JSON 消息数组 → RenderMessage（对齐后端 toRenderMessages；含 kind/detail）。
  List<RenderMessage> _parseMessages(List<Object?> raw) => raw
      .whereType<Map<String, Object?>>()
      .map(RenderMessage.fromJson)
      .toList();

  /// 输入框发送入口 + 斜杠命令拦截（对齐 Hermes：斜杠命令即拦截，不进模型）。
  /// 返回输入是否被消费：命令成功或普通文本发送 → true；未知命令 / 未连接 → false。
  bool sendInput(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return true;
    if (trimmed.startsWith('/')) {
      switch (trimmed) {
        case '/new':
          newSession();
          return true;
        case '/compact':
          compact();
          return true;
        default:
          return false; // 未知命令：前端本地提示且不发送
      }
    }
    send(trimmed);
    return true;
  }

  void send(String text) {
    // 未连接（connecting/offline）时禁止发送：AiClient.send 会静默丢弃，
    // 否则乐观追加的 user 消息永不送达（幽灵消息）。
    if (state.status != AiConnStatus.online) return;
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    // 乐观追加：后端事件流无 user 回显，不本地追加则实时对话中用户消息不显示。
    // optimistic 为本地标记（链延续 marker 插到它之前，评审建议 1）。
    final userMsg = RenderMessage(
      role: 'user',
      text: trimmed,
      thinking: '',
      toolCalls: const [],
      optimistic: true,
    );
    state = state.copyWith(messages: [...state.messages, userMsg]);
    _client?.send(ClientPrompt(trimmed));
  }

  void abort() => _client?.send(const ClientAbort());
  void newSession() => _client?.send(const ClientNewSession());
  void compact() => _client?.send(const ClientCompact());
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
