import { beforeEach, describe, expect, test } from 'vitest'
import { useAiStore } from './ai-store'

// jsdom 无 WebSocket：store 通过 useAiStore 暴露 setWsFactory 注入
class FakeSocket {
  static instances: FakeSocket[] = []
  sent: string[] = []
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
  send(d: string) {
    this.sent.push(d)
  }
  close() {}
  emit(json: unknown) {
    this.onmessage?.({ data: JSON.stringify(json) })
  }
  open() {
    this.onopen?.()
  }
}

beforeEach(() => {
  FakeSocket.instances = []
  useAiStore.setState({
    status: 'offline',
    busy: false,
    currentSessionId: null,
    messages: [],
    sessions: [],
    activeTurn: null,
    lastError: null,
  })
})

describe('ai-store', () => {
  test('connect 后收到 session_ready 更新状态', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({
      type: 'session_ready',
      sessionId: 's1',
      model: 'deepseek/deepseek-v4-flash',
      messages: [],
    })
    ws.open() // 实际顺序以实现为准；测试关注最终状态
    expect(useAiStore.getState().status).toBe('online')
    expect(useAiStore.getState().currentSessionId).toBe('s1')
  })

  test('send 恒发 prompt 并乐观追加 user 消息（交互简化：不再 busy→steer）', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.setState({ busy: false })
    useAiStore.getState().send('你好')
    useAiStore.setState({ busy: true })
    useAiStore.getState().send('停一下')
    const types = ws.sent.map((s) => JSON.parse(s).type)
    expect(types).toEqual(['prompt', 'prompt'])
    const { messages } = useAiStore.getState()
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', text: '你好', thinking: '', toolCalls: [] })
    expect(messages[1]).toMatchObject({ role: 'user', text: '停一下', thinking: '', toolCalls: [] })
  })

  test('send 非 busy 时乐观追加 user 消息并发送 prompt', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.getState().send('帮我创建任务')
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'prompt', text: '帮我创建任务' })
    const { messages } = useAiStore.getState()
    expect(messages[messages.length - 1]).toEqual({ role: 'user', text: '帮我创建任务', thinking: '', toolCalls: [] })
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

  test('turn_end 归并当前轮到 messages 并重置 activeTurn', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({ type: 'turn_start' })
    ws.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '第一轮' },
    })
    ws.emit({ type: 'turn_end' })
    const { activeTurn, messages } = useAiStore.getState()
    expect(activeTurn).toBeNull()
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ role: 'assistant', text: '第一轮', thinking: '' })
  })

  test('error 事件设置 lastError 并解除 busy；agent_end 清 lastError', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.setState({ busy: true })
    ws.emit({ type: 'error', message: '模型超时' })
    expect(useAiStore.getState().busy).toBe(false)
    expect(useAiStore.getState().lastError).toBe('模型超时')
    useAiStore.setState({ busy: true, activeTurn: null })
    ws.emit({ type: 'agent_end' })
    expect(useAiStore.getState().lastError).toBeNull()
  })

  test('多轮归并：turn_end 保留首轮工具卡，agent_end 兜底收尾', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({ type: 'agent_start' })
    ws.emit({ type: 'turn_start' })
    ws.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: '分析' },
    })
    ws.emit({
      type: 'tool_execution_start',
      toolCallId: 't1',
      toolName: 'readDiary',
      args: { date: '2026-08-09' },
    })
    ws.emit({
      type: 'tool_execution_end',
      toolCallId: 't1',
      toolName: 'readDiary',
      result: '日记内容',
      isError: false,
    })
    ws.emit({ type: 'turn_end' })
    ws.emit({ type: 'turn_start' })
    ws.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '最终答案' },
    })
    ws.emit({ type: 'agent_end' })
    const { messages, activeTurn, busy } = useAiStore.getState()
    expect(messages).toHaveLength(2)
    // 第一轮：思考 + 工具卡（含结果）
    expect(messages[0]).toMatchObject({ role: 'assistant', text: '', thinking: '分析' })
    expect(messages[0].toolCalls).toHaveLength(1)
    expect(messages[0].toolCalls[0]).toMatchObject({
      id: 't1',
      name: 'readDiary',
      result: '日记内容',
      isError: false,
    })
    expect(messages[0].toolCalls[0].args).toEqual({ date: '2026-08-09' })
    // 第二轮：最终文本
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      text: '最终答案',
      thinking: '',
      toolCalls: [],
    })
    expect(activeTurn).toBeNull()
    expect(busy).toBe(false)
  })
})
