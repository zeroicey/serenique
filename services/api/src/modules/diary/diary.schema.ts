import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Diary table definition — Drizzle schema for PostgreSQL.
// ---------------------------------------------------------------------------

export const diaries = pgTable("diaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  mood: text("mood"),
  weather: text("weather"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
