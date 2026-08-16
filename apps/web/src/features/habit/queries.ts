import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  type CreateHabitInput,
  clearHabitDaily,
  createHabit,
  deleteHabit,
  getHabitOverview,
  type HabitDailyEntry,
  type HabitEntry,
  listHabitDaily,
  listHabits,
  type SetDailyInput,
  setHabitDaily,
  type UpdateHabitInput,
  updateHabit,
} from './api'

// 习惯数据 hooks。读取走 useQuery，写入走 useMutation + 前缀 invalidate。
// 每日状态点击（做/没做/±1）高频且轻量，成功不弹 toast（避免刷屏）；失败统一弹。
// 习惯选项 CRUD 仍保留成功 toast（低频、需要确认感）。

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------

export function useHabits() {
  return useQuery({
    queryKey: ['habits'],
    queryFn: listHabits,
    staleTime: 30_000,
  })
}

export function useHabitDaily(date: string) {
  return useQuery({
    queryKey: ['habit-daily', date],
    queryFn: () => listHabitDaily(date),
    staleTime: 30_000,
  })
}

export function useHabitOverview(days: number) {
  return useQuery({
    queryKey: ['habit-overview', days],
    queryFn: () => getHabitOverview(days),
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// 习惯选项 CRUD
// ---------------------------------------------------------------------------

export function useCreateHabit(): UseMutationResult<HabitEntry, Error, CreateHabitInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createHabit,
    onSuccess: () => {
      toast.success('习惯已创建')
      queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
    onError: (error) => {
      toast.error(error.message || '习惯创建失败')
    },
  })
}

export function useUpdateHabit(): UseMutationResult<
  HabitEntry,
  Error,
  { id: string } & UpdateHabitInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }) => updateHabit(id, input),
    onSuccess: () => {
      toast.success('习惯已更新')
      queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
    onError: (error) => {
      toast.error(error.message || '习惯更新失败')
    },
  })
}

export function useDeleteHabit(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteHabit,
    onSuccess: () => {
      toast.success('习惯已删除')
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      queryClient.invalidateQueries({ queryKey: ['habit-daily'] })
      queryClient.invalidateQueries({ queryKey: ['habit-overview'] })
    },
    onError: (error) => {
      toast.error(error.message || '习惯删除失败')
    },
  })
}

// ---------------------------------------------------------------------------
// 每日状态（做/没做、计数、备注）
// ---------------------------------------------------------------------------

/** 设置每日状态。成功静默（高频点击不弹 toast），失败统一提示。 */
export function useSetDaily(): UseMutationResult<HabitDailyEntry, Error, SetDailyInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setHabitDaily,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habit-daily'] })
      queryClient.invalidateQueries({ queryKey: ['habit-overview'] })
    },
    onError: (error) => {
      toast.error(error.message || '记录失败')
    },
  })
}

/** 清除某天某习惯的记录（回未记录）。成功静默。 */
export function useClearDaily(): UseMutationResult<void, Error, { habitId: string; date: string }> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ habitId, date }) => clearHabitDaily(habitId, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habit-daily'] })
      queryClient.invalidateQueries({ queryKey: ['habit-overview'] })
    },
    onError: (error) => {
      toast.error(error.message || '清除失败')
    },
  })
}
