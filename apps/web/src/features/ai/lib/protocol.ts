// AI 助手（宁序）WS 协议消息类型（客户端 → 服务端 / 服务端 → 客户端）。
// 与后端 services/api/src/modules/ai/ai.types.ts 一一对应；后端为权威来源，
// 变更协议时需同步两边。仅复制类型结构，不 import 后端代码。
//
// 2026-08-18 自动会话管理增量：
//  - c2s 增 compact（/compact 斜杠命令）
//  - sessions 项增 parentSessionPath（链上父会话；前端单一对话流不展示，保留调试）
//  - session_switched 增 chainContinuation/reason/marker（链延续：前端不重置时间线）
//  - s2c 增 session_compacted（压缩分页重同步）/ compaction_start / compaction_end

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
  | { type: 'compact' }

export type ServerMessage =
  | {
      type: 'sessions'
      sessions: Array<{
        id: string
        name: string
        messageCount: number
        modified: string
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
      messages: unknown[]
      totalMessageCount: number
      hasMore: boolean
      // 链延续语义（自动 24h 切换 / 手动 /new）：切到链尾新会话，前端保留已加载
      // 时间线、仅追加一条系统 marker，不重置 messages/anchor。true 时后端只带
      // marker 文案（messages 为空），分页基线不变。
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
      // 压缩后的分页基线重同步（评审 B1/B2）：会话内旧消息折叠为摘要、合并流 total
      // 缩小、旧 anchor 失效 → 服务端重算尾页+新 anchor 下发，前端以本负载重建
      // 分页基线（更早历史已被摘要替代）。summary 为本次压缩摘要文本：前端将其
      // 渲染为可见窗口头部的「已压缩早期对话」可展开卡片（评审 B2）。
      type: 'session_compacted'
      sessionId: string
      messages: unknown[]
      totalMessageCount: number
      hasMore: boolean
      anchor: number
      summary?: string
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
