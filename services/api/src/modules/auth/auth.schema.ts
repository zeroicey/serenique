import type { AuthenticatorTransport } from '@simplewebauthn/server'
import { bigint, date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Auth module — identity tables (Passkey era).
//
// users: the single row the whole service belongs to (部署者本人). Personal
// profile fields (name/email/birthday) are all nullable — filled in later via
// PUT /api/users/me.
//
// passkey_credentials: one row per registered WebAuthn credential (per device /
// platform passkey manager). public_key stores the raw COSE public key bytes
// base64url-encoded (@simplewebauthn/server's isoBase64URL round-trips it).
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'), // 名字（可空，注册后可补全）
  email: text('email'), // 邮箱（可空）
  birthday: date('birthday', { mode: 'string' }), // 生日 YYYY-MM-DD（可空）
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const passkeyCredentials = pgTable(
  'passkey_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(), // WebAuthn credential ID（base64url）
    publicKey: text('public_key').notNull(), // COSE 公钥原始 bytes，base64url 编码
    transports: jsonb('transports').$type<AuthenticatorTransport[] | null>(), // usb/nfc/ble/internal
    deviceLabel: text('device_label'), // 人类可读设备标签（如「MacBook · Apple」）
    counter: bigint('counter', { mode: 'number' }).notNull().default(0), // 防克隆计数器（仅回退拒绝，相等放行：Apple 平台认证器不递增）
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_passkey_credentials_user_id').on(t.userId)],
)
