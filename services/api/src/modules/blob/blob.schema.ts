import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Blobs table — generic binary storage for all MIME types.
// Used as the low-level storage layer by diary, moment, drive, etc.
// ---------------------------------------------------------------------------

export const blobs = pgTable("blobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  originalName: text("original_name").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  checksum: text("checksum").notNull().unique(),
  metadata: jsonb("metadata").default(sql`'{}'`).notNull(),
  width: integer("width"),
  height: integer("height"),
  duration: real("duration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
