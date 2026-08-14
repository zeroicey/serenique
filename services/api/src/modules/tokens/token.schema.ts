import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Tokens module — manageable API tokens (GitHub PAT mode) for CLI / scripts.
//
// Only the SHA-256 hex hash is stored — the plaintext is shown exactly once at
// creation time. `prefix` is a display-only fragment for list UIs. revoked_at
// non-null means the token is dead (soft revoke, keeps audit history).
// ---------------------------------------------------------------------------

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // 人类可读标签（如 macbook / server）
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 hex，只存 hash
  prefix: text('prefix').notNull(), // 明文片段，仅用于列表展示识别
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }), // 最近使用时间
  revokedAt: timestamp('revoked_at', { withTimezone: true }), // 撤销时间；非空即失效
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
