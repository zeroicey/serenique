import {
  keepPreviousData,
  type UseMutationResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { uploadBlob } from '@/features/blob/api'
import type { TagEntry } from '@/features/tag/api'
import type { MediaFile } from '@/types/media'
import {
  type CreateMomentInput,
  createMoment,
  createMomentComment,
  deleteMoment,
  deleteMomentComment,
  listMomentComments,
  listMoments,
  type MomentCommentEntry,
  type MomentEntry,
  type MomentLocation,
  removeMomentAttachment,
  replaceMomentTags,
} from './api'

// Moment 数据 hooks。读取走 useInfiniteQuery（滚动分页），写入走 useMutation + invalidate。

// keyword/tagId 进入 queryKey：任一变化 → 新 queryKey → useInfiniteQuery 自动从第 1 页重建
// pages；现有 invalidateQueries({ queryKey: ['moments'] }) 前缀失效逻辑依然兼容。
export function useMoments(pageSize = 10, keyword = '', tagId = '') {
  return useInfiniteQuery({
    queryKey: ['moments', keyword, tagId, pageSize],
    queryFn: ({ pageParam }) =>
      listMoments({
        page: pageParam,
        pageSize,
        ...(keyword ? { q: keyword } : {}),
        ...(tagId ? { tag: tagId } : {}),
      }),
    initialPageParam: 1,
    // 切换关键词/标签时保留旧列表占位，避免列表闪烁（对齐 audit-page 先例）。
    placeholderData: keepPreviousData,
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
    mutationFn: ({ momentId, attachmentId }) => removeMomentAttachment(momentId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

// 新建编排：逐个上传文件 → 以内联 attachments 创建 Moment；tags 只选已有标签 id。
export function useCreateMomentWithMedia(): UseMutationResult<
  MomentEntry,
  Error,
  { text: string; files: MediaFile[]; location: MomentLocation | null; tags: string[] }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ text, files, location, tags }) => {
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
        tags,
      })
    },
    onSuccess: () => {
      toast.success('闪记发布成功')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (error) => {
      toast.error(error.message || '闪记发布失败')
    },
  })
}

// 编辑标签：PUT 整体替换（幂等集合语义）。成功后刷新闪记列表（内嵌 tags）与标签计数。
export function useReplaceMomentTags(): UseMutationResult<
  TagEntry[],
  Error,
  { momentId: string; tagIds: string[] }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ momentId, tagIds }) => replaceMomentTags(momentId, tagIds),
    onSuccess: () => {
      toast.success('标签已更新')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (error) => {
      toast.error(error.message || '标签更新失败')
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
