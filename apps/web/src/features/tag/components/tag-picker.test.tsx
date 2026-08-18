import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TagEntry } from '@/features/tag/api'
import { renderWithProviders } from '@/test/helpers'
import { TagPicker } from './tag-picker'

const TAGS: TagEntry[] = [
  { id: 't1', name: '工作', momentCount: 3, createdAt: '', updatedAt: '' },
  { id: 't2', name: '旅行', momentCount: 1, createdAt: '', updatedAt: '' },
  { id: 't3', name: '阅读', momentCount: 0, createdAt: '', updatedAt: '' },
]

describe('TagPicker', () => {
  it('展示已选标签 chips，未选标签在列表中', () => {
    renderWithProviders(<TagPicker tags={TAGS} selectedIds={['t1']} onChange={vi.fn()} />)
    // 已选 chip
    expect(screen.getByText('#工作')).toBeInTheDocument()
    // 未选标签在可选择列表
    expect(screen.getByText('#旅行')).toBeInTheDocument()
    expect(screen.getByText('#阅读')).toBeInTheDocument()
  })

  it('点击未选标签调用 onChange 追加 id', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<TagPicker tags={TAGS} selectedIds={['t1']} onChange={onChange} />)
    await user.click(screen.getByText('#旅行'))
    expect(onChange).toHaveBeenCalledWith(['t1', 't2'])
  })

  it('移除已选 chip 调用 onChange 去掉 id', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<TagPicker tags={TAGS} selectedIds={['t1', 't2']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '移除标签 工作' }))
    expect(onChange).toHaveBeenCalledWith(['t2'])
  })

  it('输入过滤未选标签', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TagPicker tags={TAGS} selectedIds={[]} onChange={vi.fn()} />)
    await user.type(screen.getByLabelText('搜索标签'), '旅行')
    expect(screen.queryByText('#工作')).not.toBeInTheDocument()
    expect(screen.getByText('#旅行')).toBeInTheDocument()
  })

  it('无标签时给出提示', () => {
    renderWithProviders(<TagPicker tags={[]} selectedIds={[]} onChange={vi.fn()} />)
    expect(screen.getByText('还没有标签，去标签页创建一个吧')).toBeInTheDocument()
  })
})
