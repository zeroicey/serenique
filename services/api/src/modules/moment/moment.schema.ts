import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Moment table definition — lightweight flash-note storage.
// ---------------------------------------------------------------------------

export const moments = pgTable("moments", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
