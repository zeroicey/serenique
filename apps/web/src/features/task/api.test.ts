import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import {
  createTask,
  createTaskGroup,
  deleteTask,
  deleteTaskGroup,
  listTaskGroups,
  listTasks,
  updateTask,
  updateTaskGroup,
} from './api'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path}`,
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)
const mockedPut = vi.mocked(api.put)
const mockedDelete = vi.mocked(api.delete)

function envelope(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response
}

afterEach(() => vi.clearAllMocks())

describe('listTaskGroups', () => {
  it('发送分页参数并解包 Paged', async () => {
    mockedGet.mockResolvedValueOnce(
      envelope(200, {
        success: true,
        message: 'ok',
        data: {
          items: [{ id: 'g1', title: '工作', createdAt: 't', updatedAt: 't' }],
          total: 1,
        },
      }),
    )
    const r = await listTaskGroups({ page: 2, pageSize: 10 })
    expect(mockedGet).toHaveBeenCalledWith('/api/task-groups', {
      searchParams: { page: '2', pageSize: '10' },
    })
    expect(r.total).toBe(1)
    expect(r.items[0].title).toBe('工作')
  })
})

describe('createTaskGroup / updateTaskGroup', () => {
  it('createTaskGroup 发送 JSON', async () => {
    mockedPost.mockResolvedValueOnce(
      envelope(201, { success: true, message: 'ok', data: { id: 'g1', title: '个人' } }),
    )
    await createTaskGroup({ title: '个人' })
    expect(mockedPost).toHaveBeenCalledWith('/api/task-groups', { json: { title: '个人' } })
  })

  it('updateTaskGroup 发送 PUT', async () => {
    mockedPut.mockResolvedValueOnce(
      envelope(200, { success: true, message: 'ok', data: { id: 'g1', title: '新名' } }),
    )
    await updateTaskGroup('g1', { title: '新名' })
    expect(mockedPut).toHaveBeenCalledWith('/api/task-groups/g1', { json: { title: '新名' } })
  })
})

describe('deleteTaskGroup', () => {
  it('204 → 直接返回', async () => {
    mockedDelete.mockResolvedValueOnce({ status: 204 } as Response)
    await expect(deleteTaskGroup('g1')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/task-groups/g1')
  })
})

describe('listTasks', () => {
  it('无过滤时不带 groupId/status 参数', async () => {
    mockedGet.mockResolvedValueOnce(
      envelope(200, { success: true, message: 'ok', data: { items: [], total: 0 } }),
    )
    await listTasks()
    expect(mockedGet).toHaveBeenCalledWith('/api/tasks', {
      searchParams: { page: '1', pageSize: '50' },
    })
  })

  it('带 groupId 与 status 过滤', async () => {
    mockedGet.mockResolvedValueOnce(
      envelope(200, { success: true, message: 'ok', data: { items: [], total: 0 } }),
    )
    await listTasks({ groupId: 'g1', status: 'done' })
    expect(mockedGet).toHaveBeenCalledWith('/api/tasks', {
      searchParams: { page: '1', pageSize: '50', groupId: 'g1', status: 'done' },
    })
  })
})

describe('createTask / updateTask / deleteTask', () => {
  it('createTask 发送 JSON', async () => {
    mockedPost.mockResolvedValueOnce(
      envelope(201, { success: true, message: 'ok', data: { id: 't1' } }),
    )
    await createTask({ title: '写周报', groupId: 'g1' })
    expect(mockedPost).toHaveBeenCalledWith('/api/tasks', {
      json: { title: '写周报', groupId: 'g1' },
    })
  })

  it('updateTask 发送 PUT', async () => {
    mockedPut.mockResolvedValueOnce(
      envelope(200, { success: true, message: 'ok', data: { id: 't1', status: 'done' } }),
    )
    await updateTask('t1', { status: 'done' })
    expect(mockedPut).toHaveBeenCalledWith('/api/tasks/t1', { json: { status: 'done' } })
  })

  it('deleteTask 204 → 直接返回', async () => {
    mockedDelete.mockResolvedValueOnce({ status: 204 } as Response)
    await expect(deleteTask('t1')).resolves.toBeUndefined()
    expect(mockedDelete).toHaveBeenCalledWith('/api/tasks/t1')
  })
})
