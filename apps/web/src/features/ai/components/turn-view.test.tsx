import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TurnState } from '@/features/ai/store/ai-store'
import { TurnView } from './turn-view'

function makeTurn(overrides: Partial<TurnState> = {}): TurnState {
  return {
    id: 1,
    thinking: '',
    text: '',
    toolCards: new Map(),
    ...overrides,
  }
}

describe('TurnView', () => {
  test('text 为空时显示「AI 正在思考」动画', () => {
    render(<TurnView turn={makeTurn()} />)
    expect(screen.getByText('AI 正在思考…')).toBeTruthy()
  })

  test('text 非空时渲染正文，不显示思考动画', () => {
    render(<TurnView turn={makeTurn({ text: '你好' })} />)
    expect(screen.queryByText('AI 正在思考…')).toBeNull()
    expect(screen.getByText('你好')).toBeTruthy()
  })

  test('thinking 非空但未输出正文时仍显示思考动画，可展开思考内容', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<TurnView turn={makeTurn({ thinking: '正在分析' })} />)
    expect(screen.getByText('AI 正在思考…')).toBeTruthy()
    const toggle = screen.getByText(/展开思考/)
    await user.click(toggle)
    expect(screen.getByText('正在分析')).toBeTruthy()
  })
})
