import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { todayUTC } from '@/lib/date'
import type { DiaryEntry } from '@/features/diary/api'
import { renderWithProviders } from '@/test/helpers'
import { DiaryItem } from './diary-item'

vi.mock('@/features/diary/queries', () => ({
  useDeleteDiary: () => ({ mutate: vi.fn() }),
}))

const longText = '长'.repeat(200)
// 用远早于今天的固定日期，确保不被 `todayUTC()` 判定为「当天」。
const PAST_DATE = '2020-01-01'

function makeDiary(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'd1',
    diaryDate: PAST_DATE,
    content: '今天很开心',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('DiaryItem', () => {
  it('非当天超长日记默认截断，可展开/收起', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DiaryItem diary={makeDiary({ content: longText })} />)
    expect(screen.getByText(longText.slice(0, 150) + '…')).toBeInTheDocument()
    expect(screen.queryByText(longText)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开' }))
    expect(screen.getByText(longText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
  })

  it('短内容不显示展开按钮', () => {
    renderWithProviders(<DiaryItem diary={makeDiary({ content: '短' })} />)
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })

  it('当天日记全量展示，不出现任何展开按钮', () => {
    renderWithProviders(<DiaryItem diary={makeDiary({ diaryDate: todayUTC(), content: longText })} />)
    expect(screen.getByText(longText)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })
})
