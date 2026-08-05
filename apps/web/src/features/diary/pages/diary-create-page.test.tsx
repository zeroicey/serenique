import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/helpers'
import * as queries from '@/features/diary/queries'
import type { DiaryEntry } from '@/features/diary/api'
import DiaryCreatePage from './diary-create-page'

vi.mock('@/features/diary/queries', () => ({
  useDiaryByDate: vi.fn(),
  useCreateDiary: vi.fn(),
  useUpdateDiary: vi.fn(),
}))

// mutate 为 spy（不触发 onSuccess，避免导航卸载）；isPending 固定 false。
let createMutate: ReturnType<typeof vi.fn>
let updateMutate: ReturnType<typeof vi.fn>

beforeEach(() => {
  createMutate = vi.fn()
  updateMutate = vi.fn()
  vi.mocked(queries.useDiaryByDate).mockReturnValue({
    isPending: false,
    data: null,
  } as never)
  vi.mocked(queries.useCreateDiary).mockReturnValue({
    mutate: createMutate,
    isPending: false,
  } as never)
  vi.mocked(queries.useUpdateDiary).mockReturnValue({
    mutate: updateMutate,
    isPending: false,
  } as never)
})

function renderCreatePage(initial = '/diary/write') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/diary/write" element={<DiaryCreatePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DiaryCreatePage', () => {
  it('新建：提交 POST 携带 content 与当天日期', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByPlaceholderText('记录今天的心情…'), '今天很开心')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    const input = createMutate.mock.calls[0][0] as { content: string; diaryDate: string }
    expect(input.content).toBe('今天很开心')
    expect(input.diaryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(updateMutate).not.toHaveBeenCalled()
  })

  it('编辑：已有日记预填并提交 PUT', async () => {
    vi.mocked(queries.useDiaryByDate).mockReturnValue({
      isPending: false,
      data: makeDiary(),
    } as never)
    const user = userEvent.setup()
    renderCreatePage('/diary/write?date=2026-08-05')
    await screen.findByDisplayValue('已有内容')
    await user.type(screen.getByPlaceholderText('记录今天的心情…'), '追加')
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    expect(updateMutate).toHaveBeenCalledTimes(1)
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: 'd1', content: '已有内容追加' })
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('未来日期被拦截，不提交', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByPlaceholderText('记录今天的心情…'), '未来日记')
    const dateInput = screen.getByLabelText('日期') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2999-12-31' } })
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(createMutate).not.toHaveBeenCalled()
    expect(updateMutate).not.toHaveBeenCalled()
  })
})

function makeDiary(): DiaryEntry {
  return {
    id: 'd1',
    diaryDate: '2026-08-05',
    content: '已有内容',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}
