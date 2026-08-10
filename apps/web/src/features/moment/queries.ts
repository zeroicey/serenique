import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { uploadBlob } from '@/features/blob/api'
import type { MediaFile } from '@/types/media'
import {
  createMoment,
  createMomentComment,
  deleteMoment,
  deleteMomentComment,
  listMoments,
  listMomentComments,
  removeMomentAttachment,
  type CreateMomentInput,
  type MomentCommentEntry,
  type MomentEntry,
  type MomentLocation,
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
  { text: string; files: MediaFile[]; location: MomentLocation | null }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ text, files, location }) => {
      const blobs: string[] = []
      for (const file of files) {
        if (!file.file) throw new Error('文件数据缺失')
        const blob = await uploadBlob(file.file)
        blobs.push(blob.id)
      }
      return createMoment({
        text,
        // 后端 CreateMomentSchema.location 为 optional（不接受 null），null 时省略。
        location: location ?? undefined,
        attachments: blobs.map((blobId, i) => ({
          blobId,
          displayName: files[i]?.name,
          sortOrder: i,
        })),
      })
    },
    onSuccess: () => {
      toast.success('闪记发布成功')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '闪记发布失败')
    },
  })
}

// 评论 hooks：列表只读（惰性，按 momentId 缓存）；创建/删除成功后同步刷新该闪记的
// 评论列表与整个 moments 列表（更新 commentCount）。

export function useMomentComments(momentId: string, enabled = true) {
  return useQuery({
    queryKey: ['moment-comments', momentId],
    queryFn: () => listMomentComments(momentId),
    enabled: enabled && momentId.length > 0,
  })
}

export function useCreateMomentComment(): UseMutationResult<
  MomentCommentEntry,
  Error,
  { momentId: string; content: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ momentId, content }) => createMomentComment(momentId, content),
    onSuccess: (_data, variables) => {
      toast.success('评论发布成功')
      queryClient.invalidateQueries({ queryKey: ['moment-comments', variables.momentId] })
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '评论发布失败')
    },
  })
}

export function useDeleteMomentComment(): UseMutationResult<
  void,
  Error,
  { momentId: string; commentId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ momentId, commentId }) => deleteMomentComment(momentId, commentId),
    onSuccess: (_data, variables) => {
      toast.success('评论已删除')
      queryClient.invalidateQueries({ queryKey: ['moment-comments', variables.momentId] })
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '评论删除失败')
    },
  })
}
