import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Diary table definition — Drizzle schema for PostgreSQL.
// diary_date (YYYY-MM-DD) is unique: one entry per day.
// ---------------------------------------------------------------------------

export const diaries = pgTable("diaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  diaryDate: text("diary_date").notNull().unique(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
