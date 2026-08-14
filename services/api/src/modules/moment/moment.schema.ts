import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { MomentLocation } from '@/modules/moment/moment.types'

// ---------------------------------------------------------------------------
// Moment table definition — lightweight flash-note storage.
// ---------------------------------------------------------------------------

export const moments = pgTable('moments', {
  id: uuid('id').defaultRandom().primaryKey(),
  text: text('text').notNull(),
  /** 派生拼音检索列（内部用，不进 API 响应；scripts/backfill-moment-pinyin.ts 回填）。 */
  pinyin: text('pinyin'),
  /** 拼音首字母检索列（内部用，不进 API 响应；scripts/backfill-moment-pinyin.ts 回填）。 */
  pinyinInitial: text('pinyin_initial'),
  /** Optional location (WeChat-style): { name?, latitude?, longitude? }. */
  location: jsonb('location').$type<MomentLocation | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
