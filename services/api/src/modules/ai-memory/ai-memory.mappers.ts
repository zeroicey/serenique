import type { AiMemoryRow } from '@/modules/ai-memory/ai-memory.schema'
import type { AiMemoryEntry } from '@/modules/ai-memory/ai-memory.types'

// ---------------------------------------------------------------------------
// AI memory mappers — row → entry 纯函数。
// ---------------------------------------------------------------------------

export function toAiMemoryEntry(row: AiMemoryRow): AiMemoryEntry {
  return {
    id: row.id,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  }
}
