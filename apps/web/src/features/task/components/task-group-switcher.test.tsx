import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { TaskGroupSwitcher } from './task-group-switcher'
import { useTaskStore } from '@/features/task/store/task-store'
import { deleteTaskGroup, listTaskGroups } from '@/features/task/api'
import type { TaskGroupEntry } from '@/features/task/api'

vi.mock('@/features/task/api', () => ({
  listTaskGroups: vi.fn(),
  createTaskGroup: vi.fn(),
  updateTaskGroup: vi.fn(),
  deleteTaskGroup: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}))

const mockedListGroups = vi.mocked(listTaskGroups)
const mockedDeleteGroup = vi.mocked(deleteTaskGroup)

function makeGroup(id: string, title: string): TaskGroupEntry {
  return {
    id,
    title,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function renderSwitcher() {
  return render(<TaskGroupSwitcher />, { wrapper })
}

afterEach(() => {
  vi.clearAllMocks()
  useTaskStore.setState({ selectedGroupId: null })
})

describe('TaskGroupSwitcher', () => {
  test('无任务组时触发按钮显示占位文案', async () => {
    mockedListGroups.mockResolvedValue({ items: [], total: 0 })
    renderSwitcher()
    expect(await screen.findByText('选择任务组')).toBeTruthy()
  })

  test('触发按钮显示当前选中的任务组名（未选中时回退第一个）', async () => {
    mockedListGroups.mockResolvedValue({
      items: [makeGroup('a', '工作'), makeGroup('b', '个人')],
      total: 2,
    })
    useTaskStore.setState({ selectedGroupId: 'b' })
    renderSwitcher()
    expect(await screen.findByText('个人')).toBeTruthy()
  })

  test('打开菜单列出所有任务组与新建入口', async () => {
    mockedListGroups.mockResolvedValue({
      items: [makeGroup('a', '工作'), makeGroup('b', '个人')],
      total: 2,
    })
    renderSwitcher()
    fireEvent.click(await screen.findByText('工作')) // 触发按钮（显示第一个任务组）→ 打开菜单
    expect(screen.getByText('新建任务组')).toBeTruthy()
    expect(screen.getByText('个人')).toBeTruthy()
  })

  test('无任务组时菜单显示空态提示', async () => {
    mockedListGroups.mockResolvedValue({ items: [], total: 0 })
    renderSwitcher()
    fireEvent.click(await screen.findByText('选择任务组')) // 打开菜单
    expect(await screen.findByText('还没有任务组')).toBeTruthy()
  })

  test('点击任务组切换选中态', async () => {
    mockedListGroups.mockResolvedValue({
      items: [makeGroup('a', '工作'), makeGroup('b', '个人')],
      total: 2,
    })
    renderSwitcher()
    fireEvent.click(await screen.findByText('工作')) // 打开菜单
    fireEvent.click(screen.getByText('个人'))
    expect(useTaskStore.getState().selectedGroupId).toBe('b')
  })

  test('新建入口打开创建对话框', async () => {
    mockedListGroups.mockResolvedValue({ items: [makeGroup('a', '工作')], total: 1 })
    renderSwitcher()
    fireEvent.click(await screen.findByText('工作')) // 打开菜单
    fireEvent.click(screen.getByText('新建任务组'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('名称')).toBeTruthy()
  })

  test('重命名入口打开预填名称的对话框', async () => {
    mockedListGroups.mockResolvedValue({ items: [makeGroup('a', '工作')], total: 1 })
    renderSwitcher()
    fireEvent.click(await screen.findByText('工作')) // 打开菜单
    fireEvent.click(screen.getByLabelText('重命名任务组 工作'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('名称')).toHaveValue('工作')
  })

  test('删除入口打开确认框，确认后调用 deleteTaskGroup', async () => {
    mockedListGroups.mockResolvedValue({ items: [makeGroup('a', '工作')], total: 1 })
    mockedDeleteGroup.mockResolvedValue(undefined)
    renderSwitcher()
    fireEvent.click(await screen.findByText('工作')) // 打开菜单
    fireEvent.click(screen.getByLabelText('删除任务组 工作'))
    expect(screen.getByText(/确定删除任务组「工作」吗/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mockedDeleteGroup.mock.calls[0][0]).toBe('a'))
  })
})
