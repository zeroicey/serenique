import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MomentCommentEntry, MomentEntry } from '@/features/moment/api'
import { useMomentComments } from '@/features/moment/queries'
import { renderWithProviders } from '@/test/helpers'
import { MomentItem } from './moment-item'

const { createCommentMutate } = vi.hoisted(() => ({
  createCommentMutate: vi.fn(),
}))

vi.mock('@/features/moment/queries', () => ({
  useDeleteMoment: () => ({ mutate: vi.fn() }),
  useMomentComments: vi.fn(),
  useCreateMomentComment: () => ({ mutate: createCommentMutate }),
}))

const mockedUseMomentComments = vi.mocked(useMomentComments)

const longText = '长'.repeat(200)

function makeMoment(overrides: Partial<MomentEntry> = {}): MomentEntry {
  return {
    id: 'm1',
    text: '今天很开心',
    location: null,
    attachments: [],
    comments: [],
    commentCount: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeComment(id: string, content: string): MomentCommentEntry {
  return {
    id,
    momentId: 'm1',
    content,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

beforeEach(() => {
  createCommentMutate.mockReset()
  mockedUseMomentComments.mockReturnValue({ data: [] } as never)
})

describe('MomentItem', () => {
  it('超长文本默认截断，正文下方可展开/收起', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MomentItem moment={makeMoment({ text: longText })} />)
    expect(screen.getByText(longText.slice(0, 150) + '…')).toBeInTheDocument()
    expect(screen.queryByText(longText)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全文' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '全文' }))
    expect(screen.getByText(longText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
  })

  it('短文本不显示全文按钮', () => {
    renderWithProviders(<MomentItem moment={makeMoment({ text: '短文本' })} />)
    expect(screen.queryByRole('button', { name: '全文' })).not.toBeInTheDocument()
  })

  it('渲染字数', () => {
    renderWithProviders(<MomentItem moment={makeMoment({ text: '今天很开心' })} />)
    expect(screen.getByText('5 字')).toBeInTheDocument()
  })

  it('无评论时不显示评论区', () => {
    renderWithProviders(<MomentItem moment={makeMoment()} />)
    expect(screen.queryByText('条评论')).not.toBeInTheDocument()
    expect(screen.queryByText('查看全部')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('写条评论…')).not.toBeInTheDocument()
  })

  it('有评论时展示内联评论与数量', () => {
    mockedUseMomentComments.mockReturnValue({
      data: [makeComment('c1', '第一条'), makeComment('c2', '第二条')],
    } as never)
    renderWithProviders(<MomentItem moment={makeMoment({ commentCount: 2 })} />)
    expect(screen.getByText('第一条')).toBeInTheDocument()
    expect(screen.getByText('第二条')).toBeInTheDocument()
    expect(screen.getByText('2 条评论')).toBeInTheDocument()
  })

  it('评论数 >3 时显示查看全部入口，可打开对话框', async () => {
    const user = userEvent.setup()
    const comments = Array.from({ length: 5 }, (_, i) => makeComment(`c${i}`, `评论${i}`))
    mockedUseMomentComments.mockReturnValue({ data: comments } as never)
    renderWithProviders(<MomentItem moment={makeMoment({ commentCount: 5 })} />)

    // 内联只展示前 3 条
    expect(screen.getByText('评论0')).toBeInTheDocument()
    expect(screen.queryByText('评论4')).not.toBeInTheDocument()
    expect(screen.getByText('查看全部 5 条评论')).toBeInTheDocument()

    await user.click(screen.getByText('查看全部 5 条评论'))
    expect(screen.getByText('全部评论（5）')).toBeInTheDocument()
    expect(screen.getByText('评论4')).toBeInTheDocument()
  })

  it('添加评论：输入后发送携带正确参数', async () => {
    const user = userEvent.setup()
    mockedUseMomentComments.mockReturnValue({
      data: [makeComment('c1', '已有评论')],
    } as never)
    renderWithProviders(<MomentItem moment={makeMoment({ commentCount: 1 })} />)

    await user.click(screen.getByText('1 条评论'))
    const input = screen.getByPlaceholderText('写条评论…')
    await user.type(input, '你好呀')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(createCommentMutate).toHaveBeenCalledWith(
      { momentId: 'm1', content: '你好呀' },
      expect.any(Object),
    )
  })

  it('评论行不提供删除按钮（删除入口方案待定）', () => {
    mockedUseMomentComments.mockReturnValue({
      data: [makeComment('c1', '评论内容')],
    } as never)
    renderWithProviders(<MomentItem moment={makeMoment({ commentCount: 1 })} />)
    expect(screen.getByText('评论内容')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除评论' })).not.toBeInTheDocument()
  })

  it('有位置 name 时显示 name，整行可点击打开高德深链', () => {
    renderWithProviders(
      <MomentItem
        moment={makeMoment({
          location: { name: '北京·三里屯', latitude: 39.9087, longitude: 116.3975 },
        })}
      />,
    )
    const link = screen.getByRole('link', { name: '北京·三里屯' })
    expect(link).toHaveAttribute(
      'href',
      'https://uri.amap.com/marker?position=116.3975,39.9087&name=%E5%8C%97%E4%BA%AC%C2%B7%E4%B8%89%E9%87%8C%E5%B1%AF&callnative=1',
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('无 name 时显示坐标文本（lat, lng）', () => {
    renderWithProviders(
      <MomentItem moment={makeMoment({ location: { latitude: 39.90872, longitude: 116.39751 } })} />,
    )
    expect(screen.getByRole('link', { name: '39.9087, 116.3975' })).toBeInTheDocument()
  })

  it('无 location 时不渲染位置行', () => {
    renderWithProviders(<MomentItem moment={makeMoment()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('未知位置')).not.toBeInTheDocument()
  })

  it('只有 name 无坐标时显示 name 但不渲染链接', () => {
    renderWithProviders(<MomentItem moment={makeMoment({ location: { name: '某个地方' } })} />)
    expect(screen.getByText('某个地方')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
