import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskEntry } from '@/features/task/api'
import { TaskItem } from './task-item'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  del: vi.fn(),
  groups: [] as TaskEntry[],
}))

vi.mock('@/features/task/queries', () => ({
  useUpdateTask: () => ({ mutate: mocks.update }),
  useDeleteTask: () => ({ mutate: mocks.del }),
  useTaskGroups: () => ({ data: mocks.groups, isPending: false }),
}))

beforeEach(() => vi.clearAllMocks())

function makeTask(status: TaskEntry['status']): TaskEntry {
  return {
    id: 't1',
    groupId: 'g1',
    title: '写周报',
    status,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    completedAt: status === 'done' ? '2026-08-05T03:30:00.000Z' : null,
  }
}

describe('TaskItem', () => {
  it('渲染待办任务与勾选框', () => {
    render(<TaskItem task={makeTask('todo')} />)
    expect(screen.getByText('写周报')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('勾选后调用 updateTask 切到 done', async () => {
    const user = userEvent.setup()
    render(<TaskItem task={makeTask('todo')} />)
    await user.click(screen.getByRole('checkbox'))
    expect(mocks.update).toHaveBeenCalledWith({ id: 't1', status: 'done' })
  })

  it('已完成任务显示勾选态与完成时间，勾选后回到 todo', async () => {
    const user = userEvent.setup()
    render(<TaskItem task={makeTask('done')} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByText(/完成/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    expect(mocks.update).toHaveBeenCalledWith({ id: 't1', status: 'todo' })
  })

  it('已放弃任务不显示勾选框，显示 ✕', () => {
    render(<TaskItem task={makeTask('abandon')} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('下拉菜单删除：确认后调用 deleteTask', async () => {
    const user = userEvent.setup()
    render(<TaskItem task={makeTask('todo')} />)
    await user.click(screen.getByRole('button', { name: '任务操作' }))
    // 展开菜单后点击「删除」菜单项 → 弹出确认对话框
    await user.click(await screen.findByText('删除'))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(mocks.del).toHaveBeenCalledWith('t1')
  })
})
