import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/helpers'
import { listMoments } from '@/features/moment/api'
import type { MomentEntry } from '@/features/moment/api'
import { MomentList } from './moment-list'

vi.mock('@/features/moment/api', () => ({
  listMoments: vi.fn(),
  createMoment: vi.fn(),
  deleteMoment: vi.fn(),
  removeMomentAttachment: vi.fn(),
  listMomentComments: vi.fn(),
  createMomentComment: vi.fn(),
  deleteMomentComment: vi.fn(),
}))

const mockedList = vi.mocked(listMoments)

function makeMoment(id: string, text: string): MomentEntry {
  return {
    id,
    text,
    location: null,
    attachments: [],
    comments: [],
    commentCount: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

beforeEach(() => {
  mockedList.mockReset()
})

describe('MomentList 搜索', () => {
  it('加载后渲染搜索框与列表内容', async () => {
    mockedList.mockResolvedValue({ items: [makeMoment('m1', '北京今天的天气不错')], total: 1 })
    renderWithProviders(<MomentList />)

    expect(await screen.findByText('北京今天的天气不错')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索闪记')).toBeInTheDocument()
  })

  it('输入关键词防抖后带 q 重新请求，无结果时显示空态', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [makeMoment('m1', '北京今天的天气不错')], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    renderWithProviders(<MomentList />)
    await screen.findByText('北京今天的天气不错')

    await userEvent.type(screen.getByPlaceholderText('搜索闪记'), 'beijing')
    expect(await screen.findByText('未找到匹配的闪记')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, q: 'beijing' }),
    )
  })

  it('点击清除按钮清空关键词，恢复全量列表', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [makeMoment('m1', '北京今天的天气不错')], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [makeMoment('m1', '北京今天的天气不错')], total: 1 })

    renderWithProviders(<MomentList />)
    await screen.findByText('北京今天的天气不错')

    await userEvent.type(screen.getByPlaceholderText('搜索闪记'), 'beijing')
    await screen.findByText('未找到匹配的闪记')

    await userEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(await screen.findByText('北京今天的天气不错')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }),
    )
  })
})
