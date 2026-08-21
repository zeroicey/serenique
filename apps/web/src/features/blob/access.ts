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

/** 链接类型：original=原文件（灯箱/大图），thumb=缩略图（网格瓦片）。 */
export type BlobLinkKind = 'original' | 'thumb'

// 签名直链的会话级缓存：同一 blob+kind 在有效期内复用同一 URL（避免分页/重渲染时
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
export async function createBlobAccessLink(
  blobId: string,
  kind: BlobLinkKind = 'original',
): Promise<string> {
  const cacheKey = `${kind}:${blobId}`
  const now = Date.now()
  const hit = linkCache.get(cacheKey)
  if (hit && hit.expiresAt - 60_000 > now) return hit.url

  const json: { expiresInSeconds: number; kind?: 'thumb' } = { expiresInSeconds: 3600 }
  if (kind === 'thumb') json.kind = 'thumb'
  const res = await api.post(apiUrl(`blobs/${blobId}/access-link`), { json })
  const link = await unwrap<BlobAccessLinkEntry>(res)
  const url = resolveLinkPath(link)
  linkCache.set(cacheKey, { url, expiresAt: link.expires * 1000 })
  return url
}

/** 清空签名链接缓存（会话退出/登出时调用，可选）。 */
export function clearBlobAccessLinkCache(): void {
  linkCache.clear()
}

export function useBlobAccessUrls(
  blobIds: string[],
  kind: BlobLinkKind = 'original',
): UseQueryResult<Record<string, string>> {
  return useQuery({
    queryKey: ['blob-access-urls', kind, blobIds],
    queryFn: async () => {
      const entries = await Promise.all(
        blobIds.map(async (id) => {
          try {
            return await createBlobAccessLink(id, kind)
          } catch {
            // dev 未配签名密钥：回退无签名直链（此时 dev 一般无 auth 或同源代理）
            return resolveApiPath(`/api/blobs/${id}/file${kind === 'thumb' ? '?thumbnail=1' : ''}`)
          }
        }),
      )
      return Object.fromEntries(blobIds.map((id, i) => [id, entries[i]]))
    },
    enabled: blobIds.length > 0,
    staleTime: 5 * 60_000,
  })
}
