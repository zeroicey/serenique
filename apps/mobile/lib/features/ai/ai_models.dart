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
