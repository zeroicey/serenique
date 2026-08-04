import { diaries } from "@/modules/diary/diary.schema";
import type { DiaryEntry } from "@/modules/diary/diary.types";

// ---------------------------------------------------------------------------
// Diary mappers — row → entry conversion. Pure functions, no DB / IO.
// ---------------------------------------------------------------------------

export function toDiaryEntry(row: typeof diaries.$inferSelect): DiaryEntry {
  return {
    id: row.id,
    diaryDate: row.diaryDate,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
