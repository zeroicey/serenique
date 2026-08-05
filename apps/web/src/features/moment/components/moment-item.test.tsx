import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MomentEntry } from '@/features/moment/api'
import { MomentItem } from './moment-item'

vi.mock('@/features/moment/queries', () => ({
  useDeleteMoment: () => ({ mutate: vi.fn() }),
}))

const longText = '长'.repeat(200)

function makeMoment(text: string): MomentEntry {
  return {
    id: 'm1',
    text,
    attachments: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

describe('MomentItem', () => {
  it('超长文本默认截断，可展开/收起', async () => {
    const user = userEvent.setup()
    render(<MomentItem moment={makeMoment(longText)} />)
    expect(screen.getByText('展开')).toBeInTheDocument()
    await user.click(screen.getByText('展开'))
    expect(screen.getByText('收起')).toBeInTheDocument()
  })

  it('短文本不显示展开按钮', () => {
    render(<MomentItem moment={makeMoment('短文本')} />)
    expect(screen.queryByText('展开')).not.toBeInTheDocument()
  })

  it('渲染字数', () => {
    render(<MomentItem moment={makeMoment('今天很开心')} />)
    expect(screen.getByText('5 字')).toBeInTheDocument()
  })
})
