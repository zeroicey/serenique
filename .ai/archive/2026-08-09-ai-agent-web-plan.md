# AI 助手模块（宁序）Web 前端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/web` 把 `/ai`「宁序」占位页替换为真实聊天页：二级会话侧边栏 + 聊天主区（流式渲染、thinking 折叠、工具调用卡片、停止/打断），经 `/api/ai/ws` WebSocket 与后端对话。

**Architecture:** 需求文档 `.ai/requirements/2026-08-09-ai-agent-module.md`（评审修正版）。`features/ai/` 内自包含：zustand store（连接/消息/会话状态）＋ 组件（侧边栏/消息流/composer）。Markdown 用 `streamdown`（Vercel，react-markdown 流式替代品，基于 shadcn/ui 设计系统）。WS 协议与后端 `ai.types.ts` 对齐（prompt/steer/followUp/abort/list_sessions/new_session/switch_session/delete_session + 事件）。

**Tech Stack:** React 19 / Vite 8 / TypeScript strict / Tailwind v4 + shadcn(Base UI) / React Router 8 / Zustand 5 / streamdown / Vitest + RTL。

## Global Constraints

- 工作目录：`apps/web/`；路径别名 `@/*` → `src/*`；请求路径经 `@/api/client` 的 `apiUrl()`；WS URL 用新增 `apiWsUrl()`（ws:// 派生）。
- 服务端数据只走 TanStack Query；**AI 聊天状态（WS 连接/消息流/会话列表）走 zustand**（`features/ai/store/`）。
- 所有页面 `React.lazy` + `<Suspense>` 懒加载（现有路由模式）。
- 中文文案直接内联。
- `streamdown` 安装后须在 `src/styles/globals.css`（或项目实际全局 css 文件）加 `@source` 行（monorepo：`@source "../../../node_modules/streamdown/dist/*.js"`，相对路径按 css 文件位置调整）。
- dev 下 vite proxy 需对 `/api` 开启 `ws: true`（现有 proxy 只转发 HTTP）。
- 测试：Vitest + RTL；**jsdom 无 WebSocket**——store 的连接层抽成可注入 `wsFactory`，测试用 fake WebSocket 类。
- 验证命令：`bun run typecheck && bun run test && bun run lint && bun run build`（web 内）；不要用 `bun test`（web 用 vitest）。
- 提交信息用英文 conventional-commit。

---

### Task 1: 路由替换 + 页面骨架 + WS URL 工具

**Files:**
- Modify: `apps/web/src/app/router.tsx:62-65`（/ai 路由指向 ai-page）
- Create: `apps/web/src/features/ai/pages/ai-page.tsx`
- Create: `apps/web/src/features/ai/lib/protocol.ts`（WS 消息类型，与后端对齐）
- Create: `apps/web/src/features/ai/lib/ws-url.ts`
- Modify: `apps/web/vite.config.ts`（proxy 加 ws: true）

**Interfaces:**
- Produces: `protocol.ts` 的 `ClientMessage`/`ServerMessage` 类型（与后端 `ai.types.ts` 一一对应）；`apiWsUrl(path?: string): string`（返回 `ws(s)://host/api/ai/ws`）；`AiPage`（骨架布局：`<div className="flex h-full">` 左侧 240px 会话栏占位 + 右侧聊天主区占位）。

- [ ] **Step 1: WS URL 工具 + 协议类型**

`apps/web/src/features/ai/lib/ws-url.ts`：

```ts
// 派生 WebSocket 地址：优先 env.apiBaseUrl（生产跨域），否则当前 origin。
// http(s) → ws(s)；path 默认 /api/ai/ws。
import { env } from '@/config/env'

export function apiWsUrl(path = '/api/ai/ws'): string {
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '')
  const wsOrigin = origin.replace(/^http/, 'ws')
  return `${wsOrigin}${path.startsWith('/') ? path : `/${path}`}`
}
```

`apps/web/src/features/ai/lib/protocol.ts`：把后端 `ai.types.ts` 的 `ClientMessage`/`ServerMessage` 联合类型完整复制（删除后端注释，保留类型结构）。

- [ ] **Step 2: 路由指向 ai-page**

`router.tsx`：

```tsx
path: 'ai',
element: lazyPage(() => import('@/features/ai/pages/ai-page')),
handle: { nav: <ModuleTitleNav title="宁序" /> },
```

- [ ] **Step 3: 页面骨架**

`ai-page.tsx`（布局占位，后续任务填充组件）：

```tsx
import { SessionSidebar } from '@/features/ai/components/session-sidebar'
import { ChatArea } from '@/features/ai/components/chat-area'

export default function AiPage() {
  return (
    <div className="flex h-full min-h-0">
      <SessionSidebar />
      <ChatArea />
    </div>
  )
}
```

- [ ] **Step 4: vite proxy 支持 WS**

`vite.config.ts` 的 `server.proxy` 改为：

```ts
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    ws: true,
  },
},
```

- [ ] **Step 5: 占位组件（避免页面报错）**

创建 `session-sidebar.tsx`、`chat-area.tsx`（各返回 `React.lazy` 前的简单 `<div className="flex-1 min-w-0" />` 与 `<aside className="w-60 border-r shrink-0" />` 占位）。验证 `bun run typecheck && bun run test`（App.test 若断言 placeholder 文案需同步检查）。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/router.tsx apps/web/src/features/ai apps/web/vite.config.ts
git commit -m "feat: add ai page skeleton and ws url helper"
```

---

### Task 2: AI store（zustand：连接 + 消息流 + 会话）

**Files:**
- Create: `apps/web/src/features/ai/store/ai-store.ts`
- Create: `apps/web/src/features/ai/store/ai-store.test.ts`

**Interfaces:**
- Produces（组件消费的精确状态与动作）：
  - state: `status: 'connecting'|'online'|'offline'`、`busy: boolean`、`currentSessionId: string | null`、`model: string`、`sessions: SessionItem[]`、`messages: RenderMessage[]`、`activeTurn: TurnState | null`
  - actions: `connect()`、`send(text)`（busy 时自动发 steer）、`abort()`、`newSession()`、`switchSession(id)`、`deleteSession(id)`、`refreshSessions()`
  - types: `RenderMessage = { role; text; thinking; toolCalls: RenderToolCall[] }`（与后端 `toRenderMessages` 输出对齐）、`TurnState = { id; thinking; text; toolCards: Map<toolCallId, ToolCardState> }`

- [ ] **Step 1: 写失败测试（fake WebSocket 驱动）**

`ai-store.test.ts`：

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import { useAiStore } from './ai-store'

// jsdom 无 WebSocket：store 通过 useAiStore 暴露 setWsFactory 注入
class FakeSocket {
  static instances: FakeSocket[] = []
  sent: string[] = []
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  constructor(public url: string) { FakeSocket.instances.push(this) }
  send(d: string) { this.sent.push(d) }
  close() {}
  emit(json: unknown) { this.onmessage?.({ data: JSON.stringify(json) }) }
  open() { this.onopen?.() }
}

beforeEach(() => {
  FakeSocket.instances = []
  useAiStore.setState({ status: 'offline', busy: false, currentSessionId: null, messages: [], sessions: [], activeTurn: null })
})

describe('ai-store', () => {
  test('connect 后收到 session_ready 更新状态', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    const p = useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({ type: 'session_ready', sessionId: 's1', model: 'deepseek/deepseek-v4-flash', messages: [] })
    ws.open() // 实际顺序以实现为准；测试关注最终状态
    expect(useAiStore.getState().status).toBe('online')
    expect(useAiStore.getState().currentSessionId).toBe('s1')
  })

  test('busy 时 send 发 steer，否则发 prompt', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.setState({ busy: false })
    useAiStore.getState().send('你好')
    useAiStore.setState({ busy: true })
    useAiStore.getState().send('停一下')
    const types = ws.sent.map((s) => JSON.parse(s).type)
    expect(types).toEqual(['prompt', 'steer'])
  })

  test('text_delta 追加到 activeTurn.text', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({ type: 'turn_start' })
    ws.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '你' } })
    ws.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '好' } })
    expect(useAiStore.getState().activeTurn?.text).toBe('你好')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd apps/web && bun run test -- src/features/ai/store/ai-store.test.ts
```

Expected: FAIL（store 不存在）。

- [ ] **Step 3: 实现 ai-store.ts**

```ts
import { create } from 'zustand'
import { apiWsUrl } from '@/features/ai/lib/ws-url'
import type { ClientMessage, ServerMessage } from '@/features/ai/lib/protocol'

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
    if (ws) return
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
```

- [ ] **Step 4: 运行确认通过**

```bash
cd apps/web && bun run test -- src/features/ai/store/ai-store.test.ts && bun run typecheck
```

Expected: PASS + typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/store/
git commit -m "feat: add ai zustand store (ws connection, message stream, sessions)"
```

---

### Task 3: 消息区组件（消息流 / turn / thinking / 工具卡片）

**Files:**
- Create: `apps/web/src/features/ai/components/message-list.tsx`
- Create: `apps/web/src/features/ai/components/turn-view.tsx`
- Create: `apps/web/src/features/ai/components/thinking-block.tsx`
- Create: `apps/web/src/features/ai/components/tool-card.tsx`
- Create: `apps/web/src/features/ai/components/message-list.test.tsx`

**Interfaces:**
- Consumes: store 的 `messages` / `activeTurn`。
- Produces: `MessageList`（渲染历史 + 当前 turn）、`TurnView({ turn })`、`ThinkingBlock({ text })`（默认折叠，点击展开）、`ToolCard({ card })`（名称/状态/参数/结果，可折叠展开）。

- [ ] **Step 1: 写组件测试**

`message-list.test.tsx`（用 `@/test/helpers` 的 `renderWithProviders`；store 用 zustand 直接 setState 注入状态）：

```tsx
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAiStore } from '@/features/ai/store/ai-store'
import { MessageList } from './message-list'

function renderWithState() {
  useAiStore.setState({
    messages: [
      { role: 'user', text: '帮我创建任务', thinking: '', toolCalls: [] },
      {
        role: 'assistant',
        text: '好的，已创建。',
        thinking: '用户要建任务',
        toolCalls: [{ id: 't1', name: 'create_task', args: { title: '写周报' }, result: '{"id":"1"}', isError: false }],
      },
    ],
    activeTurn: null,
  })
  return render(<MessageList />)
}

describe('MessageList', () => {
  test('渲染用户消息与助手回复', () => {
    renderWithState()
    expect(screen.getByText('帮我创建任务')).toBeTruthy()
    expect(screen.getByText('好的，已创建。')).toBeTruthy()
  })

  test('渲染工具调用卡片', () => {
    renderWithState()
    expect(screen.getByText('create_task')).toBeTruthy()
    expect(screen.getByText(/已创建|运行中|完成/)).toBeTruthy()
  })

  test('thinking 默认折叠，点击展开', async () => {
    renderWithState()
    const toggle = screen.getByText(/思考|Thinking/i)
    expect(screen.queryByText('用户要建任务')).toBeNull()
    toggle.click()
    expect(screen.getByText('用户要建任务')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd apps/web && bun run test -- src/features/ai/components/message-list.test.tsx
```

Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现组件**

`thinking-block.tsx`：

```tsx
import { useState } from 'react'

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-1 text-sm">
      <button type="button" className="text-muted-foreground text-xs hover:underline" onClick={() => setOpen((v) => !v)}>
        {open ? '收起思考' : '展开思考'}
      </button>
      {open && <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-2 text-muted-foreground text-xs">{text}</div>}
    </div>
  )
}
```

`tool-card.tsx`：

```tsx
import { useState } from 'react'
import type { ToolCardState } from '@/features/ai/store/ai-store'

export function ToolCard({ card }: { card: ToolCardState }) {
  const [open, setOpen] = useState(false)
  const stateText = card.running ? '运行中' : card.isError ? '出错' : '完成'
  return (
    <div className="mt-2 rounded-md border border-border bg-card text-sm">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-mono text-primary">⚙ {card.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{stateText}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-xs">
          <pre className="whitespace-pre-wrap text-muted-foreground">{JSON.stringify(card.args, null, 2)}</pre>
          {card.result && <pre className="mt-2 whitespace-pre-wrap">{card.result}</pre>}
        </div>
      )}
    </div>
  )
}
```

`turn-view.tsx`（组装 thinking + text + toolCards）：

```tsx
import type { TurnState } from '@/features/ai/store/ai-store'
import { ThinkingBlock } from './thinking-block'
import { ToolCard } from './tool-card'

export function TurnView({ turn }: { turn: TurnState }) {
  return (
    <div className="flex flex-col gap-1">
      <ThinkingBlock text={turn.thinking} />
      <div className="max-w-[78%] rounded-lg border border-border bg-card px-3.5 py-2.5 whitespace-pre-wrap break-words">{turn.text}</div>
      {[...turn.toolCards.values()].map((card) => <ToolCard key={card.id} card={card} />)}
    </div>
  )
}
```

`message-list.tsx`：

```tsx
import { useEffect, useRef } from 'react'
import { useAiStore } from '@/features/ai/store/ai-store'
import { TurnView } from './turn-view'

export function MessageList() {
  const messages = useAiStore((s) => s.messages)
  const activeTurn = useAiStore((s) => s.activeTurn)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTurn?.text])

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="self-end max-w-[78%] rounded-lg bg-primary/10 px-3.5 py-2.5 whitespace-pre-wrap break-words">{m.text}</div>
        ) : (
          <div key={i} className="flex flex-col gap-1">
            <ThinkingBlock text={m.thinking} />
            <div className="max-w-[78%] rounded-lg border border-border bg-card px-3.5 py-2.5 whitespace-pre-wrap break-words">{m.text}</div>
            {m.toolCalls.map((tc) => <ToolCard key={tc.id} card={{ ...tc, running: false }} />)}
          </div>
        ),
      )}
      {activeTurn && <TurnView turn={activeTurn} />}
      <div ref={bottomRef} />
    </div>
  )
}
```

> 注：`message-list.tsx` 里历史消息直接显示纯文本；**Task 4 会用 `<Streamdown>` 替换文本渲染**。当前步骤保持 `whitespace-pre-wrap` 文本，保证测试通过。

- [ ] **Step 4: 运行确认通过**

```bash
cd apps/web && bun run test -- src/features/ai/components/message-list.test.tsx && bun run typecheck
```

Expected: PASS + typecheck。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/components/
git commit -m "feat: add ai message rendering (turn, thinking, tool cards)"
```

---

### Task 4: streamdown 集成（Markdown 流式渲染）

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/styles/globals.css`（或实际全局 css 文件，先 `ls src/styles/` 确认）
- Modify: `apps/web/src/features/ai/components/turn-view.tsx`
- Modify: `apps/web/src/features/ai/components/message-list.tsx`

- [ ] **Step 1: 安装**

```bash
cd apps/web && bun add streamdown
```

- [ ] **Step 2: Tailwind @source**

在全局 css（含 `@import "tailwindcss"` 的文件）内追加：

```css
@source "../../../node_modules/streamdown/dist/*.js";
```

（路径相对 css 文件到根 `node_modules`——monorepo hoist；若 css 在 `src/styles/`，`../../` 到 `apps/web`，再 `../..` 到根。实施时按实际层级调整并 `bun run build` 验证 class 被扫到。）

- [ ] **Step 3: 文本渲染替换为 Streamdown**

`turn-view.tsx` 与 `message-list.tsx` 中助手文本块替换为：

```tsx
import { Streamdown } from 'streamdown'
import 'streamdown/styles.css'

<Streamdown animated isAnimating={isStreaming}>{text}</Streamdown>
```

（`turn-view`：`isStreaming={turn.text.length > 0}` 由组件自行决定或由 store `busy` 传入；`message-list` 历史消息 `isAnimating={false}`。`animated` 属性保持流式增量渲染。）

- [ ] **Step 4: 验证**

```bash
cd apps/web && bun run typecheck && bun run test && bun run build
```

Expected: 全绿；build 产物包含 streamdown 样式（可抽查 `dist/assets/*.css` 含 `.md-` 类）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/bun.lock apps/web/src/styles apps/web/src/features/ai/components
git commit -m "feat: render ai messages with streamdown"
```

---

### Task 5: Composer（输入/发送/打断/停止）

**Files:**
- Create: `apps/web/src/features/ai/components/composer.tsx`
- Create: `apps/web/src/features/ai/components/composer.test.tsx`

**Interfaces:**
- Consumes: store `busy` / `send` / `abort`。
- Produces: `Composer`（textarea Enter 发送 / Shift+Enter 换行；busy 时 placeholder 提示可打断，发送变「打断(steer)」；另设停止按钮）。

- [ ] **Step 1: 测试**

`composer.test.tsx`：

```tsx
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAiStore } from '@/features/ai/store/ai-store'
import { Composer } from './composer'

describe('Composer', () => {
  test('Enter 发送文本（store.send 被调用）', () => {
    let sent = ''
    useAiStore.setState({ busy: false, send: (t) => { sent = t } } as any)
    render(<Composer />)
    fireEvent.change(screen.getByPlaceholderText(/输入消息/), { target: { value: '你好' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/输入消息/), { key: 'Enter' })
    expect(sent).toBe('你好')
  })

  test('busy 时按钮文案变为打断', () => {
    useAiStore.setState({ busy: true })
    render(<Composer />)
    expect(screen.getByText('打断')).toBeTruthy()
  })

  test('停止按钮触发 abort', () => {
    let aborted = false
    useAiStore.setState({ busy: true, abort: () => { aborted = true } } as any)
    render(<Composer />)
    fireEvent.click(screen.getByText('停止'))
    expect(aborted).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败** → `bun run test -- src/features/ai/components/composer.test.tsx` FAIL。

- [ ] **Step 3: 实现**

```tsx
import { useState } from 'react'
import { useAiStore } from '@/features/ai/store/ai-store'

export function Composer() {
  const busy = useAiStore((s) => s.busy)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const [text, setText] = useState('')

  function submit() {
    if (!text.trim()) return
    send(text.trim())
    setText('')
  }

  return (
    <div className="flex shrink-0 gap-2 border-t border-border p-3">
      <textarea
        className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        rows={2}
        value={text}
        placeholder={busy ? 'agent 运行中…（输入内容可打断）' : '输入消息，Enter 发送（Shift+Enter 换行）'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
        }}
      />
      <button
        type="button"
        className="rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={submit}
      >
        发送
      </button>
      <button
        type="button"
        className="rounded-md border border-border px-3 text-sm"
        onClick={() => send(text.trim())}
        disabled={!busy || !text.trim()}
      >
        打断
      </button>
      <button
        type="button"
        className="rounded-md border border-border px-3 text-sm text-destructive"
        onClick={abort}
        disabled={!busy}
      >
        停止
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过** → `bun run test -- src/features/ai/components/composer.test.tsx && bun run typecheck` PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/components/composer.tsx apps/web/src/features/ai/components/composer.test.tsx
git commit -m "feat: add ai composer (send/steer/abort)"
```

---

### Task 6: 会话侧边栏

**Files:**
- Create: `apps/web/src/features/ai/components/session-sidebar.tsx`
- Create: `apps/web/src/features/ai/components/session-sidebar.test.tsx`

**Interfaces:**
- Consumes: store `sessions` / `currentSessionId` / `newSession` / `switchSession` / `deleteSession`。
- Produces: `SessionSidebar`（240px，新建按钮 + 会话列表 + 在线状态点；删除需 `confirm`）。

- [ ] **Step 1: 测试**

`session-sidebar.test.tsx`：

```tsx
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAiStore } from '@/features/ai/store/ai-store'
import { SessionSidebar } from './session-sidebar'

describe('SessionSidebar', () => {
  test('渲染会话列表与当前项高亮', () => {
    useAiStore.setState({
      sessions: [
        { id: 'a', name: '今天计划', messageCount: 3, modified: '' },
        { id: 'b', name: '新会话', messageCount: 0, modified: '' },
      ],
      currentSessionId: 'a',
    } as any)
    render(<SessionSidebar />)
    expect(screen.getByText('今天计划')).toBeTruthy()
    expect(screen.getByText('新会话')).toBeTruthy()
  })

  test('点击会话触发 switchSession', () => {
    const switched: string[] = []
    useAiStore.setState({ sessions: [{ id: 'b', name: '新会话', messageCount: 0, modified: '' }], currentSessionId: 'a', switchSession: (id) => switched.push(id) } as any)
    render(<SessionSidebar />)
    fireEvent.click(screen.getByText('新会话'))
    expect(switched).toEqual(['b'])
  })

  test('删除触发 confirm + deleteSession', () => {
    const del: string[] = []
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAiStore.setState({ sessions: [{ id: 'a', name: '今天计划', messageCount: 1, modified: '' }], currentSessionId: 'a', deleteSession: (id) => del.push(id) } as any)
    render(<SessionSidebar />)
    fireEvent.click(screen.getByTitle('删除'))
    expect(del).toEqual(['a'])
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现**

```tsx
import { useAiStore } from '@/features/ai/store/ai-store'

export function SessionSidebar() {
  const sessions = useAiStore((s) => s.sessions)
  const currentSessionId = useAiStore((s) => s.currentSessionId)
  const status = useAiStore((s) => s.status)
  const newSession = useAiStore((s) => s.newSession)
  const switchSession = useAiStore((s) => s.switchSession)
  const deleteSession = useAiStore((s) => s.deleteSession)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">会话</h2>
        <button type="button" className="rounded border border-border px-2 text-sm" onClick={newSession} title="新建会话">＋</button>
      </header>
      <div className="flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">暂无会话</p>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 text-sm ${s.id === currentSessionId ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            onClick={() => s.id !== currentSessionId && switchSession(s.id)}
            title={`${s.name} · ${s.messageCount} 条消息`}
          >
            <span className="flex-1 truncate">{s.name}</span>
            <button
              type="button"
              title="删除"
              className="invisible text-xs text-destructive group-hover:visible"
              onClick={(e) => { e.stopPropagation(); if (window.confirm(`删除会话「${s.name}」？此操作不可恢复。`)) deleteSession(s.id) }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className={`size-2 rounded-full ${status === 'online' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {status === 'online' ? '在线' : status === 'connecting' ? '连接中…' : '已断开'}
      </footer>
    </aside>
  )
}
```

- [ ] **Step 4: 运行确认通过** → `bun run test -- src/features/ai/components/session-sidebar.test.tsx && bun run typecheck` PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/components/session-sidebar.tsx apps/web/src/features/ai/components/session-sidebar.test.tsx
git commit -m "feat: add ai session sidebar"
```

---

### Task 7: ChatArea 组装 + 全量验证

**Files:**
- Modify: `apps/web/src/features/ai/components/chat-area.tsx`（从占位改为真实组合）
- Modify: `apps/web/src/features/ai/pages/ai-page.tsx`（挂载时 `connect()`）

**Interfaces:**
- Produces: `ChatArea` = `MessageList` + `Composer`（`flex flex-col min-w-0 flex-1`）；`AiPage` 挂载 `useEffect(() => { useAiStore.getState().connect() }, [])`。

- [ ] **Step 1: 组装**

`chat-area.tsx`：

```tsx
import { MessageList } from './message-list'
import { Composer } from './composer'

export function ChatArea() {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <MessageList />
      <Composer />
    </main>
  )
}
```

`ai-page.tsx` 补 connect：

```tsx
import { useEffect } from 'react'
import { useAiStore } from '@/features/ai/store/ai-store'
// ...existing layout...
useEffect(() => { useAiStore.getState().connect() }, [])
```

- [ ] **Step 2: 全量验证**

```bash
cd apps/web && bun run typecheck && bun run test && bun run lint && bun run build
```

Expected: 全绿。若 App.test.tsx 或 placeholder 相关测试断言 `/ai` 占位内容，同步更新为新页面断言（不再渲染占位文案）。

- [ ] **Step 3: 手工冒烟（需后端已按后端计划部署）**

```bash
cd apps/web && bun run dev
# 浏览器打开 http://localhost:5173/ai（需先登录：dev 无 WEBAUTHN_RP_ID 时认证跳过）
# 预期：侧边栏显示会话；输入「帮我创建一个任务：写周报」→ AI 流式回复 + create_task 工具卡片
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/ai
git commit -m "feat: assemble ai chat page"
```

---

## 完成后核对（Self-review）

- [ ] `bun run typecheck && bun run test && bun run lint && bun run build`（web 内）全绿
- [ ] `/ai` 页面：连接→会话列表→对话→工具卡片→新建/切换/删除会话→打断/停止 全部可操作
- [ ] streamdown 样式生效（`dist` 产物含其 class）
- [ ] 需求文档 §4.4 全部落实（二级侧边栏/streamdown/zustand/thinking 折叠）
