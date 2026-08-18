import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// API 令牌（tokens 模块）契约：GitHub PAT 模式——明文只在创建响应中出现一次，
// 列表只含 prefix（随机段前 8 位，品牌前缀 serenique_ 恒定）。

export interface TokenEntry {
  id: string
  name: string
  /** 展示用明文片段（随机段前 8 位），无明文。 */
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** 创建响应：明文仅此一次。 */
export interface TokenCreateResult {
  plaintext: string
  item: TokenEntry
}

export async function listTokens(): Promise<TokenEntry[]> {
  const res = await api.get(apiUrl('tokens'))
  const data = await unwrap<{ items: TokenEntry[] }>(res)
  return data.items
}

export async function createToken(name: string): Promise<TokenCreateResult> {
  const res = await api.post(apiUrl('tokens'), { json: { name } })
  return unwrap<TokenCreateResult>(res)
}

export async function revokeToken(id: string): Promise<void> {
  // 成功为 204 No Content（空 body）——不能走 unwrap（response.json() 会炸）。
  const res = await api.delete(apiUrl(`tokens/${id}`))
  if (res.status === 204) return
  await unwrap<void>(res)
}

// AI 记忆（用户画像，L2 注入层）契约：用户自维护的自我介绍/偏好，
// 随每次对话注入给宁序。GET 无记录返回 content 空串（200）；PUT upsert≤2048。

export interface MemoryEntry {
  id: number
  content: string
  updatedAt: string
}

export async function getAiMemory(): Promise<MemoryEntry> {
  const res = await api.get(apiUrl('ai/memory'))
  return unwrap<MemoryEntry>(res)
}

export async function updateAiMemory(content: string): Promise<MemoryEntry> {
  const res = await api.put(apiUrl('ai/memory'), { json: { content } })
  return unwrap<MemoryEntry>(res)
}
