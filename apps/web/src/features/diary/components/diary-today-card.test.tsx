import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/helpers'
import * as queries from '@/features/diary/queries'
import type { DiaryEntry } from '@/features/diary/api'
import { DiaryTodayCard } from './diary-today-card'

vi.mock('@/features/diary/queries', () => ({
  useDiaryByDate: vi.fn(),
  useDiaries: vi.fn(),
  useCreateDiary: vi.fn(),
  useUpdateDiary: vi.fn(),
  useDeleteDiary: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(queries.useDiaryByDate).mockReturnValue({
    isPending: false,
    data: null,
  } as never)
})

describe('DiaryTodayCard', () => {
  it('无今天 → 显示写今天的 CTA', () => {
    renderWithProviders(
      <MemoryRouter>
        <DiaryTodayCard />
      </MemoryRouter>,
    )
    expect(screen.getByText('今天还没有写日记。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写今天的日记' })).toBeInTheDocument()
  })

  it('有今天 → 显示内容与编辑按钮', () => {
    vi.mocked(queries.useDiaryByDate).mockReturnValue({
      isPending: false,
      data: makeDiary(),
    } as never)
    renderWithProviders(
      <MemoryRouter>
        <DiaryTodayCard />
      </MemoryRouter>,
    )
    expect(screen.getByText('今天很开心')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
  })

  it('今天日记长内容全量展示，不出现展开按钮', () => {
    vi.mocked(queries.useDiaryByDate).mockReturnValue({
      isPending: false,
      data: { ...makeDiary(), content: '长'.repeat(200) },
    } as never)
    renderWithProviders(
      <MemoryRouter>
        <DiaryTodayCard />
      </MemoryRouter>,
    )
    expect(screen.getByText('长'.repeat(200))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '展开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
  })

  it('加载中 → 显示骨架屏', () => {
    vi.mocked(queries.useDiaryByDate).mockReturnValue({
      isPending: true,
      data: null,
    } as never)
    renderWithProviders(
      <MemoryRouter>
        <DiaryTodayCard />
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })
})

function makeDiary(): DiaryEntry {
  return {
    id: 'd1',
    diaryDate: '2026-08-05',
    content: '今天很开心',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}
