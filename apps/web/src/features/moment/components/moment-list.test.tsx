import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MomentEntry } from '@/features/moment/api'
import { listMoments } from '@/features/moment/api'
import { useTags } from '@/features/tag/queries'
import { renderWithProviders } from '@/test/helpers'
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

vi.mock('@/features/tag/queries', () => ({
  useTags: vi.fn(),
}))

const mockedList = vi.mocked(listMoments)
const mockedUseTags = vi.mocked(useTags)

const TAGS = [
  { id: 't1', name: '工作', momentCount: 2, createdAt: '', updatedAt: '' },
  { id: 't2', name: '旅行', momentCount: 1, createdAt: '', updatedAt: '' },
]

function makeMoment(id: string, text: string): MomentEntry {
  return {
    id,
    text,
    location: null,
    attachments: [],
    comments: [],
    commentCount: 0,
    tags: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

beforeEach(() => {
  mockedList.mockReset()
  mockedUseTags.mockReturnValue({ data: TAGS, isPending: false } as never)
})

describe('MomentList 搜索', () => {
  it('加载后渲染搜索框与列表内容', async () => {
    mockedList.mockResolvedValue({ items: [makeMoment('m1', '北京今天的天气不错')], total: 1 })
    renderWithProviders(
      <MemoryRouter initialEntries={['/moment']}>
        <MomentList />
      </MemoryRouter>,
    )

    expect(await screen.findByText('北京今天的天气不错')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索闪记')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '按标签筛选' })).toBeInTheDocument()
  })

  it('输入关键词防抖后带 q 重新请求，无结果时显示空态', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [makeMoment('m1', '北京今天的天气不错')], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 })

    renderWithProviders(
      <MemoryRouter initialEntries={['/moment']}>
        <MomentList />
      </MemoryRouter>,
    )
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

    renderWithProviders(
      <MemoryRouter initialEntries={['/moment']}>
        <MomentList />
      </MemoryRouter>,
    )
    await screen.findByText('北京今天的天气不错')

    await userEvent.type(screen.getByPlaceholderText('搜索闪记'), 'beijing')
    await screen.findByText('未找到匹配的闪记')

    await userEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(await screen.findByText('北京今天的天气不错')).toBeInTheDocument()
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }))
  })
})

describe('MomentList 标签筛选', () => {
  it('从 URL ?tag= 读取初始标签过滤，请求带 tag 参数', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0 })
    renderWithProviders(
      <MemoryRouter initialEntries={['/moment?tag=t1']}>
        <MomentList />
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, tag: 't1' }),
    )
    expect(await screen.findByText('该标签下暂无闪记')).toBeInTheDocument()
  })

  it('通过筛选按钮选择标签后请求带 tag，并显示当前筛选 chip', async () => {
    mockedList.mockResolvedValue({ items: [], total: 0 })
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter initialEntries={['/moment']}>
        <MomentList />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: '按标签筛选' }))
    await user.click(await screen.findByText('#旅行'))

    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, tag: 't2' }),
    )
    expect(screen.getByText('仅显示该标签下的闪记')).toBeInTheDocument()
  })

  it('点击 chip 的清除按钮移除标签筛选，恢复全量列表', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [makeMoment('m1', '任意闪记')], total: 1 })
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter initialEntries={['/moment?tag=t1']}>
        <MomentList />
      </MemoryRouter>,
    )
    await screen.findByText('该标签下暂无闪记')

    await user.click(screen.getByRole('button', { name: '清除标签筛选' }))
    expect(await screen.findByText('任意闪记')).toBeInTheDocument()
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }))
  })
})
