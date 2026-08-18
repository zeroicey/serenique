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
  | { type: 'load_more'; limit?: number }
  // 手动压缩（前端 /compact 斜杠命令 → c2s）。服务端 session.compact()；
  // 进度经 compaction_start/compaction_end（s2c）回显。
  | { type: 'compact' }

export type ServerMessage =
  | {
      type: 'sessions'
      sessions: Array<{
        id: string
        name: string
        messageCount: number
        modified: string
        // 链上父会话文件路径（自动会话链；前端单一对话流不展示，保留供调试/内部）
        parentSessionPath?: string
      }>
    }
  | {
      type: 'session_ready'
      sessionId: string
      model: string
      messages: unknown[]
      totalMessageCount: number
      hasMore: boolean
    }
  | {
      type: 'session_switched'
      sessionId: string
      model: string
      // 链延续语义：切到链尾新会话（自动 24h 切换 / 手动 /new）。前端**保留**已
      // 加载时间线，只按 marker 追加一条系统提示，不重置 messages/anchor——
      // 合并流只在尾部增长（旧下标不变），anchor 继续有效。
      messages: unknown[]
      totalMessageCount: number
      hasMore: boolean
      chainContinuation?: boolean
      reason?: 'auto_timeout' | 'manual'
      marker?: string
    }
  | { type: 'session_deleted'; sessionId: string }
  | {
      type: 'messages_loaded'
      messages: unknown[]
      totalMessageCount: number
      hasMore: boolean
    }
  | {
      // 压缩完成后的分页基线重同步（评审 B1）：会话内消息折叠为摘要，合并流
      // total 缩小、旧 anchor 失效 → 服务端重算尾页+total+新 anchor 下发，
      // 前端以本负载重建分页基线（更早历史已被摘要替代，向上滚动按新 total 重新加载）。
      type: 'session_compacted'
      sessionId: string
      messages: unknown[]
      totalMessageCount: number
      hasMore: boolean
      anchor: number
    }
  | {
      type: 'compaction_start'
      reason: 'manual' | 'threshold' | 'overflow'
    }
  | {
      type: 'compaction_end'
      reason: 'manual' | 'threshold' | 'overflow'
      result?: { summary: string; tokensBefore: number; firstKeptEntryId: string }
      aborted: boolean
      willRetry: boolean
      errorMessage?: string
    }
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
