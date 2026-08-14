import type { events } from '@/modules/event/event.schema'
import type { EventEntry } from '@/modules/event/event.types'

// ---------------------------------------------------------------------------
// Event mappers — row → entry conversion. Pure functions, no DB / IO.
// ---------------------------------------------------------------------------

export function toEventEntry(row: typeof events.$inferSelect): EventEntry {
  return {
    id: row.id,
    title: row.title,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    isAllDay: row.isAllDay,
    location: row.location,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
