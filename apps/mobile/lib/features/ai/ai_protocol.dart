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
