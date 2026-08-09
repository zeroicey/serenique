import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
})
