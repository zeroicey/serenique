import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { getDiaryByDate, listDiaries } from './api'
import { useDiaries, useDiaryByDate } from './queries'
import type { DiaryEntry } from './api'

vi.mock('./api', () => ({
  getDiaryByDate: vi.fn(),
  listDiaries: vi.fn(),
  createDiary: vi.fn(),
  updateDiary: vi.fn(),
  deleteDiary: vi.fn(),
}))

const mockedGetByDate = vi.mocked(getDiaryByDate)
const mockedList = vi.mocked(listDiaries)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useDiaryByDate', () => {
  it('404（api 层转 null）→ data 为 null', async () => {
    mockedGetByDate.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useDiaryByDate('2026-08-05'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('命中返回日记', async () => {
    mockedGetByDate.mockResolvedValueOnce(makeDiary('2026-08-05'))
    const { result } = renderHook(() => useDiaryByDate('2026-08-05'), { wrapper })
    await waitFor(() => expect(result.current.data?.diaryDate).toBe('2026-08-05'))
  })
})

describe('useDiaries', () => {
  it('循环拉取并按 diaryDate 降序', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [makeDiary('2026-08-01'), makeDiary('2026-08-03')], total: 3 })
      .mockResolvedValueOnce({ items: [makeDiary('2026-08-02')], total: 3 })
    const { result } = renderHook(() => useDiaries(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedList).toHaveBeenCalledTimes(2)
    const dates = result.current.data?.map((d) => d.diaryDate)
    expect(dates).toEqual(['2026-08-03', '2026-08-02', '2026-08-01'])
  })
})

function makeDiary(diaryDate: string): DiaryEntry {
  return {
    id: `d-${diaryDate}`,
    diaryDate,
    content: `内容 ${diaryDate}`,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}
