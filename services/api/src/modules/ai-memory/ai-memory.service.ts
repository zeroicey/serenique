import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { AI_MEMORY_SINGLETON_ID, isEmptyProfile } from '@/modules/ai-memory/ai-memory.domain'
import { toAiMemoryEntry } from '@/modules/ai-memory/ai-memory.mappers'
import { aiMemory } from '@/modules/ai-memory/ai-memory.schema'
import type { AiMemoryEntry, PutAiMemoryInput } from '@/modules/ai-memory/ai-memory.types'

// ---------------------------------------------------------------------------
// AI memory service — 用户画像（L2）单行 CRUD。
//
// get：无记录返回空画像（200，前端首次即空框，不 404——单行资源惯例）。
// upsert：固定主键 INSERT ... ON CONFLICT 覆盖（PUT 幂等）。
// getUserProfileText：供 ai.service 的 before_agent_start 钩子组装 L2 段；
//   按 updatedAt 判断——画像未编辑（updatedAt 未变）则复用缓存文本、不重建
//   （轻量读 updatedAt，非每轮全量），编辑后缓存失效。
// ---------------------------------------------------------------------------

/** L2 段缓存：画像未编辑时复用文本，避免每轮读 DB。 */
let profileCache: { updatedAt: string; text: string } | undefined

export const aiMemoryService = {
  async get(): Promise<AiMemoryEntry> {
    const [row] = await db.select().from(aiMemory).where(eq(aiMemory.id, AI_MEMORY_SINGLETON_ID))
    return toAiMemoryEntry(
      row ?? { id: AI_MEMORY_SINGLETON_ID, content: '', updatedAt: new Date(0) },
    )
  },

  async upsert(input: PutAiMemoryInput): Promise<AiMemoryEntry> {
    const content = input.content.trim()
    const [row] = await db
      .insert(aiMemory)
      .values({ id: AI_MEMORY_SINGLETON_ID, content })
      .onConflictDoUpdate({
        target: aiMemory.id,
        set: { content, updatedAt: new Date() },
      })
      .returning()
    // 编辑后缓存立即失效（下一轮读到新画像）。
    profileCache = undefined
    return toAiMemoryEntry(row)
  },

  /**
   * 用户画像 → 直接可注入的 L2 段文本（含标题；空画像返回 ''）。按 updatedAt
   * 判断：画像未编辑（updatedAt 与缓存一致）就复用缓存文本、不重建；编辑后
   * （updatedAt 变）重建并刷新缓存。每次仍轻量读一次 updatedAt 作判断。
   */
  async getUserProfileText(): Promise<string> {
    const entry = await aiMemoryService.get()
    if (isEmptyProfile(entry.content)) return ''
    if (profileCache && profileCache.updatedAt === entry.updatedAt) return profileCache.text
    const text = `[用户画像]\n${entry.content}`
    profileCache = { updatedAt: entry.updatedAt, text }
    return text
  },
}
