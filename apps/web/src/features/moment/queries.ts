import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { uploadBlob } from '@/features/blob/api'
import type { MediaFile } from '@/types/media'
import {
  createMoment,
  deleteMoment,
  listMoments,
  removeMomentAttachment,
  type CreateMomentInput,
  type MomentEntry,
} from './api'

// Moment 数据 hooks。读取走 useInfiniteQuery（滚动分页），写入走 useMutation + invalidate。

export function useMoments(pageSize = 10) {
  return useInfiniteQuery({
    queryKey: ['moments', pageSize],
    queryFn: ({ pageParam }) => listMoments({ page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length === 0) return undefined
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })
}

export function useCreateMoment(): UseMutationResult<MomentEntry, Error, CreateMomentInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMoment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

export function useDeleteMoment(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMoment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

export function useRemoveMomentAttachment(): UseMutationResult<
  void,
  Error,
  { momentId: string; attachmentId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ momentId, attachmentId }) =>
      removeMomentAttachment(momentId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

// 新建编排：逐个上传文件 → 以内联 attachments 创建 Moment。
export function useCreateMomentWithMedia(): UseMutationResult<
  MomentEntry,
  Error,
  { text: string; files: MediaFile[] }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ text, files }) => {
      const blobs: string[] = []
      for (const file of files) {
        if (!file.file) throw new Error('文件数据缺失')
        const blob = await uploadBlob(file.file)
        blobs.push(blob.id)
      }
      return createMoment({
        text,
        attachments: blobs.map((blobId, i) => ({
          blobId,
          displayName: files[i]?.name,
          sortOrder: i,
        })),
      })
    },
    onSuccess: () => {
      toast.success('闪念发布成功')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '闪念发布失败')
    },
  })
}
