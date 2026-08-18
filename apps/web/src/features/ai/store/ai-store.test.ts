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
    hasMoreMessages: false,
    loadingMore: false,
    totalMessages: 0,
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
      totalMessageCount: 0,
      hasMore: false,
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
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      text: '帮我创建任务',
      thinking: '',
      toolCalls: [],
      optimistic: true, // 本地标记：链延续 marker 插到它之前（评审建议 1）
    })
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

  test('session_ready 带 hasMore 时设置分页状态', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({
      type: 'session_ready',
      sessionId: 's2',
      model: 'deepseek/v4',
      messages: [{ role: 'user', text: '最新', thinking: '', toolCalls: [] }],
      totalMessageCount: 50,
      hasMore: true,
    })
    const s = useAiStore.getState()
    expect(s.hasMoreMessages).toBe(true)
    expect(s.totalMessages).toBe(50)
    expect(s.messages).toHaveLength(1)
    // 分页基线：最早持有下标 = total - 已发尾部条数（镜像后端 anchor）
    expect(s.oldestHeldIndex).toBe(49)
  })

  test('loadMore 发 load_more 并置 loadingMore；messages_loaded prepend', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    // 初始：已有 1 条尾部消息，hasMore=true
    useAiStore.setState({
      hasMoreMessages: true,
      messages: [{ role: 'user', text: '最新', thinking: '', toolCalls: [] }],
    })
    useAiStore.getState().loadMore()
    expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({ type: 'load_more' })
    expect(useAiStore.getState().loadingMore).toBe(true)
    // 防并发：loadingMore 中再调不重复发
    const sentBefore = ws.sent.length
    useAiStore.getState().loadMore()
    expect(ws.sent.length).toBe(sentBefore)
    // 收到 messages_loaded：prepend 更早的消息
    ws.emit({
      type: 'messages_loaded',
      messages: [{ role: 'assistant', text: '更早', thinking: '', toolCalls: [] }],
      totalMessageCount: 50,
      hasMore: false,
    })
    const s = useAiStore.getState()
    expect(s.loadingMore).toBe(false)
    expect(s.hasMoreMessages).toBe(false)
    expect(s.totalMessages).toBe(50)
    expect(s.messages).toHaveLength(2)
    expect(s.messages[0].text).toBe('更早')
    expect(s.messages[1].text).toBe('最新')
  })

  test('oldestHeldIndex：prepend 时前移，尾部追加/流式消息时不变', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    // 会话就绪：50 条会话发尾部 20 条 → 基线 30
    ws.emit({
      type: 'session_ready',
      sessionId: 's1',
      model: 'deepseek/v4',
      messages: Array.from({ length: 20 }, (_, i) => ({
        role: 'user',
        text: `已持有-${i}`,
        thinking: '',
        toolCalls: [],
      })),
      totalMessageCount: 50,
      hasMore: true,
    })
    expect(useAiStore.getState().oldestHeldIndex).toBe(30)

    // prepend 更早批次 10 条：基线前移到 20，且 key 不碰撞（无重复）
    ws.emit({
      type: 'messages_loaded',
      messages: Array.from({ length: 10 }, (_, i) => ({
        role: 'assistant',
        text: `更早-${i}`,
        thinking: '',
        toolCalls: [],
      })),
      totalMessageCount: 50,
      hasMore: true,
    })
    expect(useAiStore.getState().oldestHeldIndex).toBe(20)
    expect(useAiStore.getState().messages).toHaveLength(30)

    // 尾部增量（乐观 user 追加 / turn_end 落定）：基线不动
    useAiStore.getState().send('新问题')
    expect(useAiStore.getState().messages).toHaveLength(31)
    expect(useAiStore.getState().oldestHeldIndex).toBe(20)
    // 追加前后 key 集合 = [20..50) 全部唯一
    const keys = useAiStore
      .getState()
      .messages.map((_, i) => useAiStore.getState().oldestHeldIndex + i)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('error 事件复位 loadingMore（load_more 异常不再永久卡死懒加载）', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.setState({ loadingMore: true, hasMoreMessages: true })
    ws.emit({ type: 'error', message: 'load_more 失败' })
    const s = useAiStore.getState()
    expect(s.loadingMore).toBe(false)
    expect(s.lastError).toBe('load_more 失败')
    // 复位后可以再次发起加载
    const sentBefore = ws.sent.length
    useAiStore.getState().loadMore()
    expect(ws.sent.length).toBe(sentBefore + 1)
  })

  test('hasMore=false 时 loadMore 不发请求', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.setState({ hasMoreMessages: false })
    const sentBefore = ws.sent.length
    useAiStore.getState().loadMore()
    expect(ws.sent.length).toBe(sentBefore)
  })

  test('session_switched chainContinuation：保留时间线、追加 system marker、不重置分页基线', () => {
    useAiStore.setState({
      currentSessionId: 's1',
      model: 'deepseek/v4',
      messages: [{ role: 'user', text: '旧消息', thinking: '', toolCalls: [] }],
      totalMessages: 30,
      hasMoreMessages: true,
      oldestHeldIndex: 20,
    })
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({
      type: 'session_switched',
      sessionId: 's2',
      model: 'deepseek/v4',
      messages: [],
      totalMessageCount: 0,
      hasMore: false,
      chainContinuation: true,
      reason: 'auto_timeout',
      marker: '已开启新会话',
    })
    const s = useAiStore.getState()
    // 切到新链尾 + 追加 marker
    expect(s.currentSessionId).toBe('s2')
    expect(s.messages).toHaveLength(2)
    expect(s.messages[0]).toMatchObject({ role: 'user', text: '旧消息' })
    expect(s.messages[1]).toMatchObject({ kind: 'system', text: '已开启新会话' })
    // 链延续不重置分页基线/元信息（后端只发 marker，分页不携带新值）
    expect(s.totalMessages).toBe(30)
    expect(s.hasMoreMessages).toBe(true)
    expect(s.oldestHeldIndex).toBe(20)
  })

  test('session_compacted：以重同步尾页 + 新 anchor 重建分页基线（含压缩摘要）', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.setState({
      currentSessionId: 's1',
      messages: [{ role: 'user', text: '旧消息', thinking: '', toolCalls: [] }],
      totalMessages: 50,
      hasMoreMessages: true,
      oldestHeldIndex: 30,
    })
    ws.emit({
      type: 'session_compacted',
      sessionId: 's1',
      messages: [
        {
          kind: 'compaction',
          text: '已压缩早期对话',
          detail: '摘要内容',
          thinking: '',
          toolCalls: [],
        },
        { role: 'user', text: '最新', thinking: '', toolCalls: [] },
      ],
      totalMessageCount: 12,
      hasMore: false,
      anchor: 10,
    })
    const s = useAiStore.getState()
    expect(s.messages).toHaveLength(2)
    expect(s.messages[0]).toMatchObject({ kind: 'compaction', detail: '摘要内容' })
    expect(s.messages[1]).toMatchObject({ role: 'user', text: '最新' })
    expect(s.oldestHeldIndex).toBe(10)
    expect(s.totalMessages).toBe(12)
    expect(s.hasMoreMessages).toBe(false)
    expect(s.loadingMore).toBe(false)
  })

  test('compaction_start 置位 compacting，compaction_end 复位', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    ws.emit({ type: 'compaction_start', reason: 'manual' })
    expect(useAiStore.getState().compacting).toBe(true)
    ws.emit({ type: 'compaction_end', reason: 'manual', aborted: false, willRetry: false })
    expect(useAiStore.getState().compacting).toBe(false)
  })

  test('compact action 发送 c2s compact', () => {
    useAiStore.getState().setWsFactory((url) => new FakeSocket(url) as unknown as WebSocket)
    useAiStore.getState().connect()
    const ws = FakeSocket.instances[0]
    useAiStore.getState().compact()
    expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({ type: 'compact' })
  })
})
