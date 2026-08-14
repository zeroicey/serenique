import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { moments } from '@/modules/moment/moment.schema'

// ---------------------------------------------------------------------------
// Moment comment table — self-comments on a moment (single-user, no author).
// Sub-resource of moments: FK cascades on moment delete (decision ⑥). The
// moment_id index backs both the nested list query and the cascade delete.
// ---------------------------------------------------------------------------

export const momentComments = pgTable(
  'moment_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    momentId: uuid('moment_id')
      .notNull()
      .references(() => moments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('idx_moment_comments_moment_id').on(t.momentId)],
)

export type MomentCommentRow = typeof momentComments.$inferSelect
