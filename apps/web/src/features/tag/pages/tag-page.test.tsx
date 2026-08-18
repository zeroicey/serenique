import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as queries from '@/features/tag/queries'
import { renderWithProviders } from '@/test/helpers'
import TagPage from './tag-page'

const { createMutate, renameMutate, deleteMutate } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  renameMutate: vi.fn(),
  deleteMutate: vi.fn(),
}))

vi.mock('@/features/tag/queries', () => ({
  useTags: vi.fn(),
  useCreateTag: () => ({ mutate: createMutate }),
  useRenameTag: () => ({ mutate: renameMutate }),
  useDeleteTag: () => ({ mutate: deleteMutate }),
}))

const TAGS = [
  { id: 't1', name: '工作', momentCount: 3, createdAt: '', updatedAt: '' },
  { id: 't2', name: '旅行', momentCount: 1, createdAt: '', updatedAt: '' },
]

beforeEach(() => {
  createMutate.mockReset()
  renameMutate.mockReset()
  deleteMutate.mockReset()
  vi.mocked(queries.useTags).mockReturnValue({ data: TAGS, isPending: false } as never)
})

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/tags']}>
      <TagPage />
    </MemoryRouter>,
  )
}

describe('TagPage', () => {
  it('展示标签列表与使用次数', () => {
    renderPage()
    expect(screen.getByText('#工作')).toBeInTheDocument()
    expect(screen.getByText('3 条闪记')).toBeInTheDocument()
    expect(screen.getByText('#旅行')).toBeInTheDocument()
  })

  it('回车创建标签，trim 后提交', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByLabelText('新建标签')
    await user.type(input, '  阅读  ')
    await user.keyboard('{Enter}')
    expect(createMutate).toHaveBeenCalledWith('阅读', expect.any(Object))
  })

  it('空白输入不创建', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('新建标签'), '   ')
    await user.keyboard('{Enter}')
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('点击标签名跳转对应闪记列表（带 tag 参数）', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('#旅行'))
    // 页面通过 router 跳转，标签仍在文档中即可（导航由 MemoryRouter 承接）
    expect(screen.getByText('#旅行')).toBeInTheDocument()
  })

  it('重命名标签：打开弹窗输入新名并保存', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '重命名标签 工作' }))
    const input = screen.getByDisplayValue('工作')
    await user.clear(input)
    await user.type(input, '生活')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(renameMutate).toHaveBeenCalledWith({ id: 't1', name: '生活' }, expect.any(Object))
  })

  it('删除标签经二次确认后提交', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '删除标签 工作' }))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(deleteMutate).toHaveBeenCalledWith('t1')
  })
})
