import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Event table definition — calendar events.
//
// - is_all_day is a plain boolean (NOT NULL, default false).
// - location / note are nullable text, matching the reference SQL.
// - A CHECK enforces end_at > start_at at the DB level (defense in depth; the
//   service validates the same rule via event.domain.ts).
// - The composite (start_at, end_at) index matches the time-range list query.
// ---------------------------------------------------------------------------

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    isAllDay: boolean('is_all_day').notNull().default(false),
    location: text('location'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_events_start_end_at').on(t.startAt, t.endAt),
    check('chk_events_end_after_start', sql`${t.endAt} > ${t.startAt}`),
  ],
)
