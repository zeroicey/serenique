import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Blobs table — generic binary storage for all MIME types.
// Used as the low-level storage layer by diary, moment, drive, etc.
// ---------------------------------------------------------------------------

export const blobs = pgTable('blobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  originalName: text('original_name').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  checksum: text('checksum').notNull().unique(),
  metadata: jsonb('metadata').default(sql`'{}'`).notNull(),
  width: integer('width'),
  height: integer('height'),
  duration: real('duration'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Blob attachments — business-level references to physical blob objects.
// Deleting an attachment removes the reference only; physical blob deletion is
// allowed only when no attachment rows reference the blob.
// ---------------------------------------------------------------------------

export const blobAttachments = pgTable(
  'blob_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blobId: uuid('blob_id')
      .notNull()
      .references(() => blobs.id, { onDelete: 'restrict' }),
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    role: text('role').default('attachment').notNull(),
    displayName: text('display_name'),
    sortOrder: integer('sort_order').default(0).notNull(),
    metadata: jsonb('metadata').default(sql`'{}'`).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('blob_attachments_blob_id_idx').on(table.blobId),
    index('blob_attachments_owner_idx').on(table.ownerType, table.ownerId),
    index('blob_attachments_owner_order_idx').on(
      table.ownerType,
      table.ownerId,
      table.sortOrder,
      table.createdAt,
      table.id,
    ),
  ],
)
