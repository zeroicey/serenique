import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { useAiStore } from '@/features/ai/store/ai-store'
import { MessageList } from './message-list'

// jsdom 未实现 IntersectionObserver：提供最小 mock，供懒加载哨兵测试触发回调。
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  targets: Element[] = []
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }
  observe(target: Element) {
    this.targets.push(target)
  }
  unobserve() {}
  disconnect() {
    this.targets = []
  }
  // 测试辅助：模拟哨兵进入/离开视口
  fire(intersecting: boolean) {
    const entries = this.targets.map(
      (target) =>
        ({ isIntersecting: intersecting, target }) as unknown as IntersectionObserverEntry,
    )
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

function renderWithState() {
  useAiStore.setState({
    messages: [
      { role: 'user', text: '帮我创建任务', thinking: '', toolCalls: [] },
      {
        role: 'assistant',
        text: '好的，已创建。',
        thinking: '用户要建任务',
        toolCalls: [
          {
            id: 't1',
            name: 'create_task',
            args: { title: '写周报' },
            result: '{"id":"1"}',
            isError: false,
          },
        ],
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
    // 工具卡状态文本（历史消息渲染 running:false、无错误 → 确定性为「完成」）。
    expect(screen.getByText('完成')).toBeTruthy()
  })

  test('thinking 默认折叠，点击展开', async () => {
    const user = userEvent.setup()
    renderWithState()
    const toggle = screen.getByText(/思考|Thinking/i)
    expect(screen.queryByText('用户要建任务')).toBeNull()
    await user.click(toggle)
    expect(screen.getByText('用户要建任务')).toBeTruthy()
  })

  test('助手消息经 Streamdown 渲染 Markdown（加粗）', () => {
    useAiStore.setState({
      messages: [{ role: 'assistant', text: '这是**加粗**文本', thinking: '', toolCalls: [] }],
      activeTurn: null,
    })
    const { container } = render(<MessageList />)
    // Streamdown 将 strong 渲染为 <span data-streamdown="strong">，而非 <strong> 标签
    const strong = container.querySelector('[data-streamdown="strong"]')
    expect(strong?.textContent).toBe('加粗')
  })

  test('hasMoreMessages 时渲染顶部哨兵与加载提示', () => {
    useAiStore.setState({
      messages: [{ role: 'user', text: '最新', thinking: '', toolCalls: [] }],
      activeTurn: null,
      hasMoreMessages: true,
      loadingMore: false,
    })
    render(<MessageList />)
    expect(screen.getByText('向上滚动加载更多')).toBeTruthy()
  })

  test('loadingMore 时显示加载中文案', () => {
    useAiStore.setState({
      messages: [{ role: 'user', text: '最新', thinking: '', toolCalls: [] }],
      activeTurn: null,
      hasMoreMessages: true,
      loadingMore: true,
    })
    render(<MessageList />)
    expect(screen.getByText('加载更早消息…')).toBeTruthy()
  })

  test('无更多历史时不渲染哨兵', () => {
    useAiStore.setState({
      messages: [{ role: 'user', text: '最新', thinking: '', toolCalls: [] }],
      activeTurn: null,
      hasMoreMessages: false,
      loadingMore: false,
    })
    render(<MessageList />)
    expect(screen.queryByText('向上滚动加载更多')).toBeNull()
    expect(screen.queryByText('加载更早消息…')).toBeNull()
  })

  test('FIX1：哨兵出现后 IntersectionObserver 才创建，进入视口触发 loadMore', () => {
    MockIntersectionObserver.instances = []
    const originalIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver
    const loadMore = vi.fn()
    try {
      // 首次挂载：hasMoreMessages=false（session_ready 未到）→ 哨兵未渲染 → 不建 observer
      useAiStore.setState({
        messages: [{ role: 'user', text: '最新', thinking: '', toolCalls: [] }],
        activeTurn: null,
        hasMoreMessages: false,
        loadingMore: false,
        loadMore,
      })
      render(<MessageList />)
      expect(MockIntersectionObserver.instances).toHaveLength(0)

      // session_ready 到达：hasMoreMessages=true → 哨兵渲染 + effect 重建 observer
      act(() => useAiStore.setState({ hasMoreMessages: true }))
      expect(MockIntersectionObserver.instances).toHaveLength(1)

      // 哨兵进入视口（用户滚到顶部）→ loadMore 被调用
      const io = MockIntersectionObserver.instances[0]
      act(() => io.fire(true))
      expect(loadMore).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.IntersectionObserver = originalIO
    }
  })

  test('FIX A：prepend 历史消息后已展开的思考块不折叠（key 稳定）', async () => {
    const user = userEvent.setup()
    // 初始：2 条已持有消息（尾部），基线 oldestHeldIndex=8
    useAiStore.setState({
      messages: [
        { role: 'user', text: '新问题', thinking: '', toolCalls: [] },
        { role: 'assistant', text: '回答', thinking: '深层思考', toolCalls: [] },
      ],
      oldestHeldIndex: 8,
      hasMoreMessages: true,
      loadingMore: false,
    })
    render(<MessageList />)

    // 展开思考块
    const toggle = screen.getByText(/思考|Thinking/i)
    await user.click(toggle)
    expect(screen.getByText('深层思考')).toBeTruthy()

    // prepend 更早批次（如初版 key={i}，下标整体右移会重挂载 → 展开态丢失）
    act(() =>
      useAiStore.setState({
        messages: [
          { role: 'user', text: '更早的问题', thinking: '', toolCalls: [] },
          { role: 'user', text: '新问题', thinking: '', toolCalls: [] },
          { role: 'assistant', text: '回答', thinking: '深层思考', toolCalls: [] },
        ],
        oldestHeldIndex: 7,
        hasMoreMessages: true,
      }),
    )
    // 已持有的 assistant 消息 key 仍是 8+1（首位 user 的 key=7、原 user 8、原 assistant 9）
    expect(screen.getByText('更早的问题')).toBeTruthy()
    expect(screen.getByText('深层思考')).toBeTruthy()
  })

  test('渲染派生边界 marker（kind=system）：「已开启新会话」', () => {
    useAiStore.setState({
      messages: [
        { kind: 'system', text: '已开启新会话', thinking: '', toolCalls: [] },
        { role: 'user', text: '新问题', thinking: '', toolCalls: [] },
      ],
      activeTurn: null,
    })
    render(<MessageList />)
    expect(screen.getByText('已开启新会话')).toBeTruthy()
  })

  test('压缩摘要（kind=compaction）默认折叠，点击展开 detail', async () => {
    const user = userEvent.setup()
    useAiStore.setState({
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
      activeTurn: null,
    })
    render(<MessageList />)
    // 默认折叠：固定文案可见、摘要内容不可见
    expect(screen.getByText('已压缩早期对话')).toBeTruthy()
    expect(screen.queryByText('摘要内容')).toBeNull()
    await user.click(screen.getByText('已压缩早期对话'))
    expect(screen.getByText('摘要内容')).toBeTruthy()
  })
})
