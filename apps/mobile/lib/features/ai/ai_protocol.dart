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
  Map<String, Object?> toJson() => {
    'type': 'switch_session',
    'sessionId': sessionId,
  };
}

final class ClientDeleteSession extends ClientMessage {
  const ClientDeleteSession(this.sessionId);
  final String sessionId;
  @override
  Map<String, Object?> toJson() => {
    'type': 'delete_session',
    'sessionId': sessionId,
  };
}

final class ClientLoadMore extends ClientMessage {
  const ClientLoadMore({this.limit});
  final int? limit;
  @override
  Map<String, Object?> toJson() => {
    'type': 'load_more',
    if (limit != null) 'limit': limit,
  };
}

/// 手动压缩当前会话（前端 /compact 斜杠命令 → c2s）。服务端 session.compact()；
/// 进度经 compaction_start/compaction_end（s2c）回显。
final class ClientCompact extends ClientMessage {
  const ClientCompact();
  @override
  Map<String, Object?> toJson() => {'type': 'compact'};
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
          totalMessageCount: (json['totalMessageCount'] as num?)?.toInt() ?? 0,
          hasMore: (json['hasMore'] as bool?) ?? false,
        );
      case 'session_switched':
        return SessionSwitchedMessage(
          json['sessionId'] as String,
          (json['model'] as String?) ?? '',
          (json['messages'] as List? ?? const []).toList(),
          totalMessageCount: (json['totalMessageCount'] as num?)?.toInt() ?? 0,
          hasMore: (json['hasMore'] as bool?) ?? false,
          chainContinuation: (json['chainContinuation'] as bool?) ?? false,
          reason: json['reason'] as String?,
          marker: json['marker'] as String?,
        );
      case 'session_compacted':
        return SessionCompactedMessage(
          json['sessionId'] as String,
          (json['messages'] as List? ?? const []).toList(),
          totalMessageCount: (json['totalMessageCount'] as num?)?.toInt() ?? 0,
          hasMore: (json['hasMore'] as bool?) ?? false,
          anchor: (json['anchor'] as num?)?.toInt() ?? 0,
          summary: json['summary'] as String?,
        );
      case 'compaction_start':
        return CompactionStartMessage(
          (json['reason'] as String?) ?? 'threshold',
        );
      case 'compaction_end':
        {
          final rawResult = json['result'];
          final result = rawResult is Map<String, Object?>
              ? CompactionResult(
                  summary: (rawResult['summary'] as String?) ?? '',
                  tokensBefore:
                      (rawResult['tokensBefore'] as num?)?.toInt() ?? 0,
                  firstKeptEntryId:
                      (rawResult['firstKeptEntryId'] as String?) ?? '',
                )
              : null;
          return CompactionEndMessage(
            (json['reason'] as String?) ?? 'threshold',
            result: result,
            aborted: (json['aborted'] as bool?) ?? false,
            willRetry: (json['willRetry'] as bool?) ?? false,
            errorMessage: json['errorMessage'] as String?,
          );
        }
      case 'session_deleted':
        return SessionDeletedMessage(json['sessionId'] as String);
      case 'messages_loaded':
        return MessagesLoadedMessage(
          (json['messages'] as List? ?? const []).toList(),
          totalMessageCount: (json['totalMessageCount'] as num?)?.toInt() ?? 0,
          hasMore: (json['hasMore'] as bool?) ?? false,
        );
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
  const SessionReadyMessage(
    this.sessionId,
    this.model,
    this.messages, {
    required this.totalMessageCount,
    required this.hasMore,
  });
  final String sessionId;
  final String model;
  final List<Object?> messages;
  final int totalMessageCount;
  final bool hasMore;
}

final class SessionSwitchedMessage extends ServerMessage {
  const SessionSwitchedMessage(
    this.sessionId,
    this.model,
    this.messages, {
    required this.totalMessageCount,
    required this.hasMore,
    this.chainContinuation = false,
    this.reason,
    this.marker,
  });
  final String sessionId;
  final String model;
  final List<Object?> messages;
  final int totalMessageCount;
  final bool hasMore;

  /// 链延续语义（评审 B2）：切到链尾新会话（自动 24h / 手动 /new）。为 true 时
  /// 前端**保留**已加载时间线，仅按 [marker] 追加一条系统提示，不重置 messages/anchor。
  final bool chainContinuation;

  /// 链延续原因：'auto_timeout' | 'manual'。
  final String? reason;

  /// 链延续时新增会话边界的 marker 文案（如「已开启新会话」），非链延续时为空。
  final String? marker;
}

/// 压缩完成后的分页基线重同步（评审 B1）：会话内消息折叠为摘要，合并流 total
/// 缩小、旧 anchor 失效 → 服务端重算尾页+total+新 anchor 下发。前端以本负载
/// 重建分页基线（更早历史已被摘要替代）。
final class SessionCompactedMessage extends ServerMessage {
  const SessionCompactedMessage(
    this.sessionId,
    this.messages, {
    required this.totalMessageCount,
    required this.hasMore,
    required this.anchor,
    this.summary,
  });
  final String sessionId;
  final List<Object?> messages;
  final int totalMessageCount;
  final bool hasMore;
  final int anchor;

  /// 压缩摘要文本（评审 B2）：前端将其渲染为可见窗口的「已压缩早期对话」可展开卡片。
  final String? summary;
}

/// 压缩开始（reason：manual|threshold|overflow）。
final class CompactionStartMessage extends ServerMessage {
  const CompactionStartMessage(this.reason);
  final String reason;
}

/// 压缩结果（reason：manual|threshold|overflow；result 为压缩摘要）。
final class CompactionEndMessage extends ServerMessage {
  const CompactionEndMessage(
    this.reason, {
    this.result,
    required this.aborted,
    required this.willRetry,
    this.errorMessage,
  });
  final String reason;
  final CompactionResult? result;
  final bool aborted;
  final bool willRetry;
  final String? errorMessage;
}

/// compaction_end.result：压缩摘要负载。
class CompactionResult {
  const CompactionResult({
    required this.summary,
    required this.tokensBefore,
    required this.firstKeptEntryId,
  });
  final String summary;
  final int tokensBefore;
  final String firstKeptEntryId;
}

final class SessionDeletedMessage extends ServerMessage {
  const SessionDeletedMessage(this.sessionId);
  final String sessionId;
}

/// 向上滚动加载更早的历史消息批次（prepend 到 messages 前面）。
final class MessagesLoadedMessage extends ServerMessage {
  const MessagesLoadedMessage(
    this.messages, {
    required this.totalMessageCount,
    required this.hasMore,
  });
  final List<Object?> messages;
  final int totalMessageCount;
  final bool hasMore;
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
  const ToolExecutionUpdateMessage(
    this.toolCallId,
    this.toolName,
    this.partialResult,
  );
  final String toolCallId;
  final String toolName;
  final String partialResult;
}

final class ToolExecutionEndMessage extends ServerMessage {
  const ToolExecutionEndMessage(
    this.toolCallId,
    this.toolName,
    this.result,
    this.isError,
  );
  final String toolCallId;
  final String toolName;
  final String result;
  final bool isError;
}
