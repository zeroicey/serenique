import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { api, apiUrl, resolveApiPath } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// 签名访问链接：凭证放 query（expires+signature），不受跨站第三方 Cookie 策略影响，
// 是跨站 <img>/<video> 加载媒体的正解。dev 未配 BLOB_SIGNING_SECRET 时回退直链。
// R2 直链（生产）：access-link 返回的 path 是 s3.0icey.icu 绝对 URL，直接可用；
// 未迁移环境回退 API 代理链接（相对 path → resolveApiPath 拼 API origin）。

interface BlobAccessLinkEntry {
  path: string
  expires: number
  signature: string
}

export async function createBlobAccessLink(blobId: string): Promise<string> {
  const res = await api.post(apiUrl(`blobs/${blobId}/access-link`), {
    json: { expiresInSeconds: 3600 },
  })
  const link = await unwrap<BlobAccessLinkEntry>(res)
  return link.path.startsWith('http') ? link.path : resolveApiPath(link.path)
}

export function useBlobAccessUrls(blobIds: string[]): UseQueryResult<Record<string, string>> {
  return useQuery({
    queryKey: ['blob-access-urls', blobIds],
    queryFn: async () => {
      const entries = await Promise.all(
        blobIds.map(async (id) => {
          try {
            return await createBlobAccessLink(id)
          } catch {
            // dev 未配签名密钥：回退无签名直链（此时 dev 一般无 auth 或同源代理）
            return resolveApiPath(`/api/blobs/${id}/file`)
          }
        }),
      )
      return Object.fromEntries(blobIds.map((id, i) => [id, entries[i]]))
    },
    enabled: blobIds.length > 0,
    staleTime: 5 * 60_000,
  })
}
