import { db } from "@/db/connection";
import { diaries } from "@/modules/diary/diary.schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type {
  CreateDiaryInput,
  DiaryEntry,
  GetDiaryInput,
  ListDiaryInput,
  UpdateDiaryInput,
  DeleteDiaryInput,
} from "@/modules/diary/diary.types";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Diary service — business logic and database operations.
// ---------------------------------------------------------------------------

function toEntry(row: typeof diaries.$inferSelect): DiaryEntry {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    mood: row.mood,
    weather: row.weather,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const diaryService = {
  async create(input: CreateDiaryInput): Promise<DiaryEntry> {
    const [row] = await db.insert(diaries).values(input).returning();
    return toEntry(row);
  },

  async list(input: ListDiaryInput): Promise<{ items: DiaryEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ count }]] = await Promise.all([
      db.select().from(diaries).orderBy(diaries.createdAt).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(diaries),
    ]);
    return { items: items.map(toEntry), total: count };
  },

  async get(input: GetDiaryInput): Promise<DiaryEntry> {
    const [row] = await db.select().from(diaries).where(eq(diaries.id, input.id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    return toEntry(row);
  },

  async update(input: UpdateDiaryInput): Promise<DiaryEntry> {
    const { id, ...data } = input;
    const [row] = await db
      .update(diaries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(diaries.id, id))
      .returning();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    return toEntry(row);
  },

  async delete(input: DeleteDiaryInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(diaries)
      .where(eq(diaries.id, input.id))
      .returning({ id: diaries.id });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    return row;
  },
};
