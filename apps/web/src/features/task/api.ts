import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { Paged } from '@/types/api'

// 任务 API 契约（手动定义，对齐 services/api 现状）。
// 任务组字段：id / title；任务字段：groupId / title / status(todo|done|abandon)。
// completedAt 由服务端根据 status 自动同步（进入 done 写入、离开 done 清空），前端无需传入。

export type TaskStatus = 'todo' | 'done' | 'abandon'

export interface TaskGroupEntry {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface TaskEntry {
  id: string
  groupId: string
  title: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ListTaskGroupsParams {
  page?: number
  pageSize?: number
}

export interface ListTasksParams extends ListTaskGroupsParams {
  groupId?: string
  status?: TaskStatus
}

export interface CreateTaskGroupInput {
  title: string
}

export interface UpdateTaskGroupInput {
  title: string
}

export interface CreateTaskInput {
  title: string
  groupId: string
  status?: TaskStatus
}

export interface UpdateTaskInput {
  title?: string
  groupId?: string
  status?: TaskStatus
}

export async function listTaskGroups(
  params?: ListTaskGroupsParams,
): Promise<Paged<TaskGroupEntry>> {
  const res = await api.get(apiUrl('task-groups'), {
    searchParams: {
      page: String(params?.page ?? 1),
      pageSize: String(params?.pageSize ?? 50),
    },
  })
  return unwrap<Paged<TaskGroupEntry>>(res)
}

export async function createTaskGroup(input: CreateTaskGroupInput): Promise<TaskGroupEntry> {
  const res = await api.post(apiUrl('task-groups'), { json: input })
  return unwrap<TaskGroupEntry>(res)
}

export async function updateTaskGroup(
  id: string,
  input: UpdateTaskGroupInput,
): Promise<TaskGroupEntry> {
  const res = await api.put(apiUrl(`task-groups/${id}`), { json: input })
  return unwrap<TaskGroupEntry>(res)
}

export async function deleteTaskGroup(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`task-groups/${id}`))
  // 204 无响应体，对齐 deleteDiary 的守卫。
  if (res.status === 204) return
  await unwrap(res)
}

export async function listTasks(params?: ListTasksParams): Promise<Paged<TaskEntry>> {
  const searchParams: Record<string, string> = {
    page: String(params?.page ?? 1),
    pageSize: String(params?.pageSize ?? 50),
  }
  if (params?.groupId) searchParams.groupId = params.groupId
  if (params?.status) searchParams.status = params.status
  const res = await api.get(apiUrl('tasks'), { searchParams })
  return unwrap<Paged<TaskEntry>>(res)
}

export async function createTask(input: CreateTaskInput): Promise<TaskEntry> {
  const res = await api.post(apiUrl('tasks'), { json: input })
  return unwrap<TaskEntry>(res)
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<TaskEntry> {
  const res = await api.put(apiUrl(`tasks/${id}`), { json: input })
  return unwrap<TaskEntry>(res)
}

export async function deleteTask(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`tasks/${id}`))
  if (res.status === 204) return
  await unwrap(res)
}
