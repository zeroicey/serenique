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

// 签名直链的会话级缓存：同一 blob 在有效期内复用同一 URL（避免分页/重渲染时
// 重新申请产生新 expires → <img> src 变化 → 图片反复重载转圈）。
// 与移动端 BlobAccessService（blob_access.dart）同语义。有效期最后 60s 视为
// 过期提前刷新，防止用到一半过期白屏。
interface CachedLink {
  url: string
  expiresAt: number
}
const linkCache = new Map<string, CachedLink>()

function resolveLinkPath(link: BlobAccessLinkEntry): string {
  return link.path.startsWith('http') ? link.path : resolveApiPath(link.path)
}

/** 申请（或命中缓存返回）签名直链。有效期内多次调用返回同一 URL。 */
export async function createBlobAccessLink(blobId: string): Promise<string> {
  const now = Date.now()
  const hit = linkCache.get(blobId)
  if (hit && hit.expiresAt - 60_000 > now) return hit.url

  const res = await api.post(apiUrl(`blobs/${blobId}/access-link`), {
    json: { expiresInSeconds: 3600 },
  })
  const link = await unwrap<BlobAccessLinkEntry>(res)
  const url = resolveLinkPath(link)
  linkCache.set(blobId, { url, expiresAt: link.expires * 1000 })
  return url
}

/** 清空签名链接缓存（会话退出/登出时调用，可选）。 */
export function clearBlobAccessLinkCache(): void {
  linkCache.clear()
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
