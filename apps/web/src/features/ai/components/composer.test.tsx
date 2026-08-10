import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useAiStore } from '@/features/ai/store/ai-store'
import { Composer } from './composer'

describe('Composer', () => {
  test('Enter 发送文本（store.send 被调用）', () => {
    let sent = ''
    useAiStore.setState({
      busy: false,
      send: (t: string) => {
        sent = t
      },
    })
    render(<Composer />)
    fireEvent.change(screen.getByPlaceholderText(/输入消息/), { target: { value: '你好' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/输入消息/), { key: 'Enter' })
    expect(sent).toBe('你好')
  })

  test('空文本时发送按钮禁用', () => {
    useAiStore.setState({ busy: false })
    render(<Composer />)
    expect(screen.getByText('发送').hasAttribute('disabled')).toBe(true)
  })

  test('busy 时输入框禁用且按钮变为停止图标', () => {
    useAiStore.setState({ busy: true })
    render(<Composer />)
    const input = screen.getByPlaceholderText(/AI 正在回复/) as HTMLTextAreaElement
    expect(input.disabled).toBe(true)
    expect(screen.queryByText('发送')).toBeNull()
    expect(screen.getByLabelText('停止')).toBeTruthy()
  })

  test('点击停止触发 abort', () => {
    let aborted = false
    useAiStore.setState({
      busy: true,
      abort: () => {
        aborted = true
      },
    })
    render(<Composer />)
    fireEvent.click(screen.getByLabelText('停止'))
    expect(aborted).toBe(true)
  })

  test('IME 组合中按 Enter 不发送', () => {
    let sent: string | null = null
    useAiStore.setState({
      busy: false,
      send: (t: string) => {
        sent = t
      },
    })
    render(<Composer />)
    fireEvent.change(screen.getByPlaceholderText(/输入消息/), { target: { value: 'nihao' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/输入消息/), {
      key: 'Enter',
      isComposing: true,
    })
    expect(sent).toBeNull()
  })
})
