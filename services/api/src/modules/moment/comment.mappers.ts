import type { MomentCommentRow } from '@/modules/moment/comment.schema'
import type { MomentCommentEntry } from '@/modules/moment/comment.types'

// ---------------------------------------------------------------------------
// Moment comment mappers — row → entry conversion. Pure functions, no DB / IO.
// ---------------------------------------------------------------------------

export function toMomentCommentEntry(row: MomentCommentRow): MomentCommentEntry {
  return {
    id: row.id,
    momentId: row.momentId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Group already-sorted comment entries by moment id (for detail embedding). */
export function groupCommentsByMomentId(
  entries: MomentCommentEntry[],
): Map<string, MomentCommentEntry[]> {
  const grouped = new Map<string, MomentCommentEntry[]>()
  for (const entry of entries) {
    const group = grouped.get(entry.momentId) ?? []
    group.push(entry)
    grouped.set(entry.momentId, group)
  }
  return grouped
}
