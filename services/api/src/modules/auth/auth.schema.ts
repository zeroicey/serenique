import { bigint, date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Auth module — identity tables (Pocket ID OIDC era).
//
// users: the single row the whole service belongs to (部署者本人). Personal
// profile fields (name/email/birthday) are all nullable — filled in later via
// PUT /api/users/me. oidcSub binds the row to the Pocket ID subject (sub);
// set on first OIDC login（决策②：映射到现有行，首次登录自动绑定）.
//
// passkey_credentials: legacy WebAuthn credentials（Passkey 时代遗留）。
// 登录已不再使用；表保留至 Phase 3 归档清理（见需求文档分期），避免迁移期
// drizzle-kit 生成 DROP TABLE。
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'), // 名字（可空，注册后可补全）
  email: text('email'), // 邮箱（可空）
  birthday: date('birthday', { mode: 'string' }), // 生日 YYYY-MM-DD（可空）
  // Pocket ID subject（OIDC sub claim，唯一绑定）。可空：尚未 OIDC 登录过的存量行。
  oidcSub: text('oidc_sub').unique(),
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
