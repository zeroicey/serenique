// ---------------------------------------------------------------------------
// AI memory domain — 纯业务规则（无 DB / IO）。
// ---------------------------------------------------------------------------

/** 单行表固定主键：整个服务只有这一条用户画像。 */
export const AI_MEMORY_SINGLETON_ID = 1

/** 画像正文上限（与 ai-memory.types 的 Zod schema 同步）。 */
export const AI_MEMORY_MAX_LENGTH = 2048

/** 空画像 = 无用户画像层（L2 不注入）。 */
export function isEmptyProfile(content: string): boolean {
  return content.trim().length === 0
}
