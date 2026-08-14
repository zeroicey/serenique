import { act, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useAiStore } from '@/features/ai/store/ai-store'
import { ChatArea } from './chat-area'

const toastError = vi.spyOn(toast, 'error')

afterEach(() => {
  toastError.mockClear()
})

describe('ChatArea', () => {
  test('组装 MessageList + Composer', () => {
    useAiStore.setState({
      messages: [{ role: 'user', text: '你好，宁序', thinking: '', toolCalls: [] }],
    })
    render(<ChatArea />)
    expect(screen.getByText('你好，宁序')).toBeTruthy()
    expect(screen.getByPlaceholderText(/输入消息/)).toBeTruthy()
  })

  test('lastError 变化时弹出错误 toast', () => {
    render(<ChatArea />)
    expect(toastError).not.toHaveBeenCalled()
    act(() => useAiStore.setState({ lastError: '连接失败' }))
    expect(toastError).toHaveBeenCalledWith('连接失败')
  })

  test('lastError 清空（agent_end）不弹 toast', () => {
    useAiStore.setState({ lastError: '连接失败' })
    render(<ChatArea />)
    expect(toastError).toHaveBeenCalledTimes(1)
    act(() => useAiStore.setState({ lastError: null }))
    expect(toastError).toHaveBeenCalledTimes(1)
  })
})
