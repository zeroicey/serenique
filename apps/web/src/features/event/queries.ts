import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
  type CreateEventInput,
  type EventEntry,
  type UpdateEventInput,
} from './api'
import { dayWindow, sortEvents } from './lib'

// 事件数据 hooks。读取走 useQuery（按日窗口），写入走 useMutation + 前缀 invalidate ['events']。

export function useEvents(date: string) {
  return useQuery({
    queryKey: ['events', date],
    queryFn: async () => {
      const { from, to } = dayWindow(date)
      const events = await listEvents(from, to)
      return events.sort(sortEvents)
    },
    staleTime: 30_000,
  })
}

export function useCreateEvent(): UseMutationResult<EventEntry, Error, CreateEventInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      toast.success('日程已创建')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error(error.message || '日程创建失败')
    },
  })
}

export function useUpdateEvent(): UseMutationResult<
  EventEntry,
  Error,
  { id: string } & UpdateEventInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }) => updateEvent(id, input),
    onSuccess: () => {
      toast.success('日程已更新')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error(error.message || '日程更新失败')
    },
  })
}

export function useDeleteEvent(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      toast.success('日程已删除')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error(error.message || '日程删除失败')
    },
  })
}
