import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { MomentLocation } from "@/modules/moment/moment.types";

// ---------------------------------------------------------------------------
// Moment table definition — lightweight flash-note storage.
// ---------------------------------------------------------------------------

export const moments = pgTable("moments", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull(),
  /** Optional location (WeChat-style): { name?, latitude?, longitude? }. */
  location: jsonb("location").$type<MomentLocation | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
