import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createDiary,
  deleteDiary,
  getDiaryByDate,
  listDiaries,
  updateDiary,
  type CreateDiaryInput,
  type DiaryEntry,
} from './api'

const PAGE_SIZE = 50

// 日记数据 hooks。读取走 useQuery（客户端全量拉取 + 按 diaryDate 倒序），写入走 useMutation + invalidate。

export function useDiaries() {
  return useQuery({
    queryKey: ['diaries'],
    queryFn: async () => {
      const all: DiaryEntry[] = []
      let page = 1
      for (;;) {
        const res = await listDiaries({ page, pageSize: PAGE_SIZE })
        all.push(...res.items)
        if (all.length >= res.total) break
        page += 1
      }
      // 倒序：最新日期在前。
      return all.sort((a, b) => (a.diaryDate < b.diaryDate ? 1 : -1))
    },
    staleTime: 30_000,
  })
}

export function useDiaryByDate(date: string) {
  return useQuery({
    queryKey: ['diary', 'by-date', date],
    queryFn: () => getDiaryByDate(date),
    enabled: !!date,
  })
}

export function useCreateDiary(): UseMutationResult<DiaryEntry, Error, CreateDiaryInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDiary,
    onSuccess: () => {
      toast.success('日记保存成功')
      queryClient.invalidateQueries({ queryKey: ['diaries'] })
      queryClient.invalidateQueries({ queryKey: ['diary', 'by-date'] })
    },
    onError: (error) => {
      toast.error(error.message || '日记保存失败')
    },
  })
}

export function useUpdateDiary(): UseMutationResult<
  DiaryEntry,
  Error,
  { id: string; content: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }) => updateDiary(id, { content }),
    onSuccess: () => {
      toast.success('日记已更新')
      queryClient.invalidateQueries({ queryKey: ['diaries'] })
      queryClient.invalidateQueries({ queryKey: ['diary', 'by-date'] })
    },
    onError: (error) => {
      toast.error(error.message || '日记更新失败')
    },
  })
}

export function useDeleteDiary(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteDiary,
    onSuccess: () => {
      toast.success('日记已删除')
      queryClient.invalidateQueries({ queryKey: ['diaries'] })
      queryClient.invalidateQueries({ queryKey: ['diary', 'by-date'] })
    },
    onError: (error) => {
      toast.error(error.message || '日记删除失败')
    },
  })
}
