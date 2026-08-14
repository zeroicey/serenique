import { type UseMutationResult, useMutation } from '@tanstack/react-query'
import { type BlobEntry, uploadBlob } from './api'

// 上传 blob mutation。成功不 invalidate（blob 无列表依赖）。
export function useUploadBlob(): UseMutationResult<BlobEntry, Error, File> {
  return useMutation({ mutationFn: uploadBlob })
}
