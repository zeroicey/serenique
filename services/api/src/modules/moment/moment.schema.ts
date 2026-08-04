import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Moment table definition — lightweight flash-note storage.
// ---------------------------------------------------------------------------

export const moments = pgTable("moments", {
  id: uuid("id").defaultRandom().primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
