import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskCreateInput } from './task-create-input'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('@/features/task/queries', () => ({
  useCreateTask: () => ({ mutate: mocks.create, isPending: false }),
}))

beforeEach(() => vi.clearAllMocks())

describe('TaskCreateInput', () => {
  it('空输入时添加按钮禁用', () => {
    render(<TaskCreateInput groupId="g1" />)
    expect(screen.getByRole('button', { name: '添加任务' })).toBeDisabled()
  })

  it('输入后点击添加：调用 createTask 并清空输入', async () => {
    const user = userEvent.setup()
    render(<TaskCreateInput groupId="g1" />)
    const input = screen.getByRole('textbox', { name: '任务内容' })
    await user.type(input, '写周报')
    await user.click(screen.getByRole('button', { name: '添加任务' }))
    expect(mocks.create).toHaveBeenCalledWith({ title: '写周报', groupId: 'g1' })
    expect(input).toHaveValue('')
  })

  it('回车提交', async () => {
    const user = userEvent.setup()
    render(<TaskCreateInput groupId="g2" />)
    const input = screen.getByRole('textbox', { name: '任务内容' })
    await user.type(input, '读文档{Enter}')
    expect(mocks.create).toHaveBeenCalledWith({ title: '读文档', groupId: 'g2' })
  })
})
