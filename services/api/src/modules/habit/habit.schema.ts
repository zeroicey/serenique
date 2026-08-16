import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Habit module — two tables: habits (user-maintained options) and habit_daily
// (one status row per habit per date).
//
// - kind is text + CHECK (not a pg enum): good / bad — visual only.
// - countable distinguishes the two recording modes:
//     countable=false (default) → daily row carries status (done/not_done);
//     countable=true            → daily row carries count (times performed).
// - habits.description is an optional short intro shown next to the name.
// - habit_daily.status is NULLable — NULL means "not recorded" for that day.
// - UNIQUE (habit_id, date) enforces one row per habit per day.
// ---------------------------------------------------------------------------

export const HABIT_KINDS = ['good', 'bad'] as const
export type HabitKind = (typeof HABIT_KINDS)[number]

export const DAILY_STATUSES = ['done', 'not_done'] as const
export type DailyStatus = (typeof DAILY_STATUSES)[number]

export const habits = pgTable(
  'habits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind').notNull().$type<HabitKind>(),
    countable: boolean('countable').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_habits_sort_order').on(t.sortOrder),
    check('chk_habits_kind', sql`${t.kind} IN ('good', 'bad')`),
  ],
)

export const habitDaily = pgTable(
  'habit_daily',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    habitId: uuid('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    status: text('status').$type<DailyStatus>(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('uq_habit_daily_habit_date').on(t.habitId, t.date),
    index('idx_habit_daily_date').on(t.date),
    check(
      'chk_habit_daily_status',
      sql`${t.status} IS NULL OR ${t.status} IN ('done', 'not_done')`,
    ),
    check('chk_habit_daily_count', sql`${t.count} >= 0`),
  ],
)
