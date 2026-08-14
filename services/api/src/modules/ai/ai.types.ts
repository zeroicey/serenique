// WS 协议消息类型（客户端 → 服务端 / 服务端 → 客户端）。
// 与原型 ~/workspace/tests/pi-test/server.ts 对齐。

export type ClientMessage =
  | { type: 'prompt'; text: string }
  | { type: 'steer'; text: string }
  | { type: 'followUp'; text: string }
  | { type: 'abort' }
  | { type: 'list_sessions' }
  | { type: 'new_session' }
  | { type: 'switch_session'; sessionId: string }
  | { type: 'delete_session'; sessionId: string }

export type ServerMessage =
  | {
      type: 'sessions'
      sessions: Array<{ id: string; name: string; messageCount: number; modified: string }>
    }
  | { type: 'session_ready'; sessionId: string; model: string; messages: unknown[] }
  | { type: 'session_switched'; sessionId: string; model: string; messages: unknown[] }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'error'; message: string }
  | { type: 'agent_start' }
  | { type: 'agent_settled' }
  | { type: 'turn_start' }
  | { type: 'turn_end' }
  | { type: 'agent_end' }
  | {
      type: 'message_update'
      assistantMessageEvent: { type: 'text_delta' | 'thinking_delta'; delta: string }
    }
  | {
      type: 'tool_execution_start'
      toolCallId: string
      toolName: string
      args: unknown
    }
  | {
      type: 'tool_execution_update'
      toolCallId: string
      toolName: string
      partialResult: string
    }
  | {
      type: 'tool_execution_end'
      toolCallId: string
      toolName: string
      result: string
      isError: boolean
    }
