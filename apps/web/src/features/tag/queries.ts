import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTag, deleteTag, listTags, renameTag, type TagEntry } from './api'

// 标签数据 hooks。读取走 useQuery，写入走 useMutation + invalidate。
// 标签变更会产生/删除关联行，影响 moment 卡片内嵌 tags 与 momentCount 计数，
// 故写入成功同时 invalidate ['tags'] 与 ['moments']。

/** 全部标签（个人应用标签数有限，拉一页 pageSize=50 足够；超量属边缘情况）。 */
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ page: 1, pageSize: 50 }),
    staleTime: 30_000,
    select: (data) => data.items,
  })
}

export function useCreateTag(): UseMutationResult<TagEntry, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => createTag(name),
    onSuccess: () => {
      toast.success('标签已创建')
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (error) => {
      toast.error(error.message || '标签创建失败')
    },
  })
}

export function useRenameTag(): UseMutationResult<TagEntry, Error, { id: string; name: string }> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }) => renameTag(id, name),
    onSuccess: () => {
      toast.success('标签已重命名')
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '标签重命名失败')
    },
  })
}

export function useDeleteTag(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteTag(id),
    onSuccess: () => {
      toast.success('标签已删除')
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '标签删除失败')
    },
  })
}
