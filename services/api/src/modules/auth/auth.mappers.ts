import type { users } from './auth.schema'
import type { UserEntry } from './auth.types'

// ---------------------------------------------------------------------------
// Auth module — row → entry conversions (pure).
// ---------------------------------------------------------------------------

export function toUserEntry(row: typeof users.$inferSelect): UserEntry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    birthday: row.birthday,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
