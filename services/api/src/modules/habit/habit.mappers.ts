import type { habitDaily, habits } from '@/modules/habit/habit.schema'
import type { DailyEntry, HabitEntry } from '@/modules/habit/habit.types'

// ---------------------------------------------------------------------------
// Habit mappers — row → entry conversion. Pure functions, no DB / IO.
// ---------------------------------------------------------------------------

export function toHabitEntry(row: typeof habits.$inferSelect): HabitEntry {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    countable: row.countable,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toDailyEntry(row: typeof habitDaily.$inferSelect): DailyEntry {
  return {
    habitId: row.habitId,
    status: row.status,
    count: row.count,
  }
}
