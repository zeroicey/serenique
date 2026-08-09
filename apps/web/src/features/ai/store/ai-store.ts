// 宁序 AI 助手 store：WS 连接管理、消息流状态、会话列表（Task 2）。
// 服务端数据均来自 WS 事件（server state），不进入 TanStack Query；本 store 只做
// 连接生命周期 + 消息流聚合。协议类型消费 @/features/ai/lib/protocol（Task 1）。
import { create } from 'zustand'
import { apiWsUrl } from '@/features/ai/lib/ws-url'
import type { ClientMessage, ServerMessage } from '@/features/ai/lib/protocol'

// 渲染层消息（与后端 toRenderMessages 输出对齐）：assistant 消息由 activeTurn 落定生成。
export type RenderToolCall = {
  id: string
  name: string
  args: unknown
  result: string
  isError: boolean
}
export type RenderMessage = {
  role: 'user' | 'assistant'
  text: string
  thinking: string
  toolCalls: RenderToolCall[]
}
export type ToolCardState = RenderToolCall & { running: boolean }
export type TurnState = {
  id: number
  thinking: string
  text: string
  toolCards: Map<string, ToolCardState>
}
export type SessionItem = { id: string; name: string; messageCount: number; modified: string }

type WsFactory = (url: string) => WebSocket
let wsFactory: WsFactory | null = null

interface AiState {
  status: 'connecting' | 'online' | 'offline'
  busy: boolean
  currentSessionId: string | null
  model: string
  sessions: SessionItem[]
  messages: RenderMessage[]
  activeTurn: TurnState | null
  setWsFactory: (f: WsFactory) => void
  connect: () => Promise<void>
  send: (text: string) => void
  abort: () => void
  newSession: () => void
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  refreshSessions: () => void
}

let ws: WebSocket | null = null
let turnSeq = 0

function sendMsg(msg: ClientMessage) {
  ws?.send(JSON.stringify(msg))
}

function pushAssistantTurn() {
  const { activeTurn } = useAiStore.getState()
  if (!activeTurn) return
  const m: RenderMessage = {
    role: 'assistant',
    text: activeTurn.text,
    thinking: activeTurn.thinking,
    toolCalls: [...activeTurn.toolCards.values()].map(({ running, ...rest }) => rest),
  }
  if (!m.text && !m.thinking && m.toolCalls.length === 0) return
  useAiStore.setState((s) => ({ messages: [...s.messages, m], activeTurn: null }))
}

export const useAiStore = create<AiState>((set, get) => ({
  status: 'offline',
  busy: false,
  currentSessionId: null,
  model: '',
  sessions: [],
  messages: [],
  activeTurn: null,

  setWsFactory: (f) => { wsFactory = f },

  connect: async () => {
    // 幂等：非 offline（连接中/在线）不重建连接。基于 status 而非模块级 ws 判断，
    // 保证每次 offline 后 connect 都得到全新连接（onclose 清空 ws 后重连也自然成立）。
    if (get().status !== 'offline') return
    set({ status: 'connecting' })
    const factory = wsFactory ?? ((url: string) => new WebSocket(url))
    ws = factory(apiWsUrl())
    ws.onopen = () => set({ status: 'online' })
    ws.onmessage = (e) => {
      let ev: ServerMessage
      try { ev = JSON.parse(String(e.data)) } catch { return }
      switch (ev.type) {
        case 'session_ready':
        case 'session_switched': {
          set({ currentSessionId: ev.sessionId, model: ev.model, messages: ev.messages as RenderMessage[], busy: false, activeTurn: null })
          get().refreshSessions()
          break
        }
        case 'sessions':
          set({ sessions: ev.sessions })
          break
        case 'session_deleted':
          get().refreshSessions()
          break
        case 'error':
          set({ busy: false })
          // 错误展示由组件监听（可在 store 加 lastError 字段，组件 toast）
          break
        case 'agent_start':
          set({ busy: true })
          break
        case 'agent_end':
          set({ busy: false })
          pushAssistantTurn()
          break
        case 'turn_start':
          set({ activeTurn: { id: ++turnSeq, thinking: '', text: '', toolCards: new Map() } })
          break
        case 'message_update': {
          const a = ev.assistantMessageEvent
          const turn = get().activeTurn
          if (!turn) { set({ activeTurn: { id: ++turnSeq, thinking: '', text: '', toolCards: new Map() } }) }
          set((s) => {
            const t = s.activeTurn!
            if (a.type === 'text_delta') return { activeTurn: { ...t, text: t.text + a.delta } }
            return { activeTurn: { ...t, thinking: t.thinking + a.delta } }
          })
          break
        }
        case 'tool_execution_start':
          set((s) => {
            const t = s.activeTurn ?? { id: ++turnSeq, thinking: '', text: '', toolCards: new Map() }
            t.toolCards.set(ev.toolCallId, { id: ev.toolCallId, name: ev.toolName, args: ev.args, result: '', isError: false, running: true })
            return { activeTurn: { ...t } }
          })
          break
        case 'tool_execution_update':
          set((s) => {
            const t = s.activeTurn
            const card = t?.toolCards.get(ev.toolCallId)
            if (!t || !card) return s
            card.result += ev.partialResult
            return { activeTurn: { ...t } }
          })
          break
        case 'tool_execution_end':
          set((s) => {
            const t = s.activeTurn
            const card = t?.toolCards.get(ev.toolCallId)
            if (!t || !card) return s
            card.result = (card.result ? card.result + '\n' : '') + ev.result
            card.isError = ev.isError
            card.running = false
            return { activeTurn: { ...t } }
          })
          break
      }
    }
    ws.onclose = () => { ws = null; set({ status: 'offline', busy: false }) }
  },

  send: (text) => {
    if (!text.trim()) return
    const { busy } = get()
    sendMsg(busy ? { type: 'steer', text } : { type: 'prompt', text })
  },
  abort: () => sendMsg({ type: 'abort' }),
  newSession: () => sendMsg({ type: 'new_session' }),
  switchSession: (id) => sendMsg({ type: 'switch_session', sessionId: id }),
  deleteSession: (id) => sendMsg({ type: 'delete_session', sessionId: id }),
  refreshSessions: () => sendMsg({ type: 'list_sessions' }),
}))
