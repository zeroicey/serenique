import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskEntry, TaskGroupEntry } from './api'
import { createTask, listTaskGroups, listTasks } from './api'
import { useCreateTask, useTaskGroups, useTasks } from './queries'

vi.mock('./api', () => ({
  listTaskGroups: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  createTaskGroup: vi.fn(),
  updateTask: vi.fn(),
  updateTaskGroup: vi.fn(),
  deleteTask: vi.fn(),
  deleteTaskGroup: vi.fn(),
}))

const mockedListGroups = vi.mocked(listTaskGroups)
const mockedListTasks = vi.mocked(listTasks)
const mockedCreateTask = vi.mocked(createTask)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function makeGroup(id: string, title: string): TaskGroupEntry {
  return {
    id,
    title,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

function makeTask(id: string, groupId: string, status: TaskEntry['status']): TaskEntry {
  return {
    id,
    groupId,
    title: `任务 ${id}`,
    status,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    completedAt: null,
  }
}

afterEach(() => vi.clearAllMocks())

describe('useTaskGroups', () => {
  it('循环拉取全量任务组', async () => {
    mockedListGroups
      .mockResolvedValueOnce({
        items: [makeGroup('g1', '工作'), makeGroup('g2', '个人')],
        total: 3,
      })
      .mockResolvedValueOnce({ items: [makeGroup('g3', '学习')], total: 3 })
    const { result } = renderHook(() => useTaskGroups(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedListGroups).toHaveBeenCalledTimes(2)
    expect(result.current.data?.map((g) => g.title)).toEqual(['工作', '个人', '学习'])
  })
})

describe('useTasks', () => {
  it('无 groupId 时不发起请求', async () => {
    const { result } = renderHook(() => useTasks(null), { wrapper })
    expect(mockedListTasks).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)
  })

  it('按 groupId 过滤并循环拉取', async () => {
    mockedListTasks
      .mockResolvedValueOnce({
        items: [makeTask('t1', 'g1', 'todo'), makeTask('t2', 'g1', 'done')],
        total: 3,
      })
      .mockResolvedValueOnce({ items: [makeTask('t3', 'g1', 'abandon')], total: 3 })
    const { result } = renderHook(() => useTasks('g1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedListTasks).toHaveBeenCalledTimes(2)
    expect(mockedListTasks).toHaveBeenCalledWith({ page: 1, pageSize: 50, groupId: 'g1' })
    expect(result.current.data?.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })
})

describe('useCreateTask', () => {
  it('调用 createTask 并传入输入', async () => {
    mockedCreateTask.mockResolvedValueOnce(makeTask('t9', 'g1', 'todo'))
    const { result } = renderHook(() => useCreateTask(), { wrapper })
    act(() => {
      result.current.mutate({ title: '写周报', groupId: 'g1' })
    })
    await waitFor(() => expect(mockedCreateTask).toHaveBeenCalled())
    expect(mockedCreateTask.mock.calls[0][0]).toEqual({ title: '写周报', groupId: 'g1' })
  })
})
