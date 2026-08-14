import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Task module — two tables: task_groups (container) and tasks (children).
// A task group can hold many tasks; each task belongs to exactly one group.
//
// - status is text + CHECK (not a pg enum), values: todo / done / abandon.
// - tasks.group_id is NOT NULL with ON DELETE CASCADE.
// - All indexes are DESC / composite, matching the newest-first query habits.
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ['todo', 'done', 'abandon'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const taskGroups = pgTable(
  'task_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('idx_task_groups_updated_at_desc').on(t.updatedAt.desc())],
)

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => taskGroups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().$type<TaskStatus>(),
    dueDate: text('due_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_tasks_created_at_desc').on(t.createdAt.desc()),
    index('idx_tasks_status_created_at_desc').on(t.status, t.createdAt.desc()),
    index('idx_tasks_group_status_created_at_desc').on(t.groupId, t.status, t.createdAt.desc()),
    index('idx_tasks_due_date_status').on(t.dueDate, t.status),
    check('chk_tasks_status', sql`${t.status} IN ('todo', 'done', 'abandon')`),
    check(
      'chk_tasks_due_date_format',
      sql`${t.dueDate} IS NULL OR ${t.dueDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
  ],
)
