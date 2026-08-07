import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlaceholderPage } from './placeholder-page'

describe('PlaceholderPage', () => {
  it('显示模块名与开发中提示', () => {
    render(<PlaceholderPage title="习惯" />)
    expect(screen.getByText('习惯')).toBeInTheDocument()
    expect(screen.getByText('「习惯」模块正在开发中，敬请期待。')).toBeInTheDocument()
  })

  it('支持自定义 message', () => {
    render(<PlaceholderPage title="宁序" message="自定义说明" />)
    expect(screen.getByText('自定义说明')).toBeInTheDocument()
  })
})
