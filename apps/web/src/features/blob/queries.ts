import {
  type UseMutationResult,
  type UseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  type BlobAttachmentEntry,
  type BlobEntry,
  deleteBlob,
  listBlobAttachments,
  listBlobs,
  uploadBlob,
} from './api'

// 素材库数据 hooks：读取走 useQuery，写入走 useMutation + invalidate。
// 上传成功后不做 invalidate（素材库无列表依赖，上传入口也仅在业务模块）。

/** 上传 blob mutation。成功不 invalidate（blob 无列表依赖）。 */
export function useUploadBlob(): UseMutationResult<BlobEntry, Error, File> {
  return useMutation({ mutationFn: uploadBlob })
}

/** 素材库无限分页列表：「加载更多」累积各页；filter 变化即重置。 */
export function useBlobLibrary(input: { pageSize: number; mimeType?: string }) {
  return useInfiniteQuery({
    queryKey: ['blobs', 'infinite', input.pageSize, input.mimeType ?? ''],
    queryFn: ({ pageParam }) =>
      listBlobs({ page: pageParam, pageSize: input.pageSize, mimeType: input.mimeType }),
    initialPageParam: 1,
    getNextPageParam: (last, allPages) => {
      const loaded = allPages.length * input.pageSize
      return loaded < last.total ? allPages.length + 1 : undefined
    },
  })
}

/** 删除物理 blob；成功 invalidate ['blobs'] 刷新列表。409（被引用）由后端拒绝。 */
export function useDeleteBlob(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => deleteBlob(id),
    onSuccess: () => {
      toast.success('文件已删除')
      queryClient.invalidateQueries({ queryKey: ['blobs'] })
    },
    onError: (error) => {
      toast.error(error.message || '文件删除失败')
    },
  })
}

/** 删除确认弹窗打开时懒查该 blob 的引用方（blobId 为 null 时不发请求）。 */
export function useBlobAttachments(
  blobId: string | null,
): UseQueryResult<BlobAttachmentEntry[], Error> {
  return useQuery({
    queryKey: ['blob-attachments', blobId ?? ''],
    queryFn: () => listBlobAttachments(blobId as string),
    enabled: blobId !== null,
    staleTime: 30_000,
  })
}
