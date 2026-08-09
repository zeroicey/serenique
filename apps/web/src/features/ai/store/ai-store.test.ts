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
