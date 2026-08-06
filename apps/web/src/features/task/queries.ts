import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createTask,
  createTaskGroup,
  deleteTask,
  deleteTaskGroup,
  listTaskGroups,
  listTasks,
  updateTask,
  updateTaskGroup,
  type CreateTaskGroupInput,
  type CreateTaskInput,
  type TaskEntry,
  type TaskGroupEntry,
  type UpdateTaskGroupInput,
  type UpdateTaskInput,
} from './api'

const PAGE_SIZE = 50

// 任务数据 hooks。读取走 useQuery（任务组全量拉取；任务按任务组过滤），写入走 useMutation + invalidate。
// 写入统一以前缀 invalidate ['task-groups'] / ['tasks']，覆盖所有按任务组的子查询。

export function useTaskGroups() {
  return useQuery({
    queryKey: ['task-groups'],
    queryFn: async () => {
      const all: TaskGroupEntry[] = []
      let page = 1
      for (;;) {
        const res = await listTaskGroups({ page, pageSize: PAGE_SIZE })
        all.push(...res.items)
        if (all.length >= res.total) break
        page += 1
      }
      return all
    },
    staleTime: 30_000,
  })
}

export function useTasks(groupId: string | null) {
  return useQuery({
    queryKey: ['tasks', groupId],
    queryFn: async () => {
      const all: TaskEntry[] = []
      let page = 1
      for (;;) {
        const res = await listTasks({ page, pageSize: PAGE_SIZE, groupId: groupId ?? undefined })
        all.push(...res.items)
        if (all.length >= res.total) break
        page += 1
      }
      return all
    },
    enabled: !!groupId,
    staleTime: 30_000,
  })
}

export function useCreateTaskGroup(): UseMutationResult<
  TaskGroupEntry,
  Error,
  CreateTaskGroupInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTaskGroup,
    onSuccess: () => {
      toast.success('任务组创建成功')
      queryClient.invalidateQueries({ queryKey: ['task-groups'] })
    },
    onError: (error) => {
      toast.error(error.message || '任务组创建失败')
    },
  })
}

export function useUpdateTaskGroup(): UseMutationResult<
  TaskGroupEntry,
  Error,
  { id: string } & UpdateTaskGroupInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }) => updateTaskGroup(id, input),
    onSuccess: () => {
      toast.success('任务组已更新')
      queryClient.invalidateQueries({ queryKey: ['task-groups'] })
    },
    onError: (error) => {
      toast.error(error.message || '任务组更新失败')
    },
  })
}

export function useDeleteTaskGroup(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTaskGroup,
    onSuccess: () => {
      toast.success('任务组已删除')
      queryClient.invalidateQueries({ queryKey: ['task-groups'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error) => {
      toast.error(error.message || '任务组删除失败')
    },
  })
}

export function useCreateTask(): UseMutationResult<TaskEntry, Error, CreateTaskInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      toast.success('任务已添加')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error) => {
      toast.error(error.message || '任务添加失败')
    },
  })
}

export function useUpdateTask(): UseMutationResult<
  TaskEntry,
  Error,
  { id: string } & UpdateTaskInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }) => updateTask(id, input),
    onSuccess: () => {
      toast.success('任务已更新')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error) => {
      toast.error(error.message || '任务更新失败')
    },
  })
}

export function useDeleteTask(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      toast.success('任务已删除')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error) => {
      toast.error(error.message || '任务删除失败')
    },
  })
}
