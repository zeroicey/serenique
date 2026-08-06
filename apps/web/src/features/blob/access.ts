import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api, apiUrl, resolveApiPath } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// 签名访问链接：凭证放 query（expires+signature），不受跨站第三方 Cookie 策略影响，
// 是跨站 <img>/<video> 加载媒体的正解。dev 未配 BLOB_SIGNING_SECRET 时回退直链。

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
  return resolveApiPath(link.path)
}

export function useBlobAccessUrls(
  blobIds: string[],
): UseQueryResult<Record<string, string>> {
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
