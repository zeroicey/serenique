import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { uploadBlob, type BlobEntry } from './api'

// 上传 blob mutation。成功不 invalidate（blob 无列表依赖）。
export function useUploadBlob(): UseMutationResult<BlobEntry, Error, File> {
  return useMutation({ mutationFn: uploadBlob })
}
