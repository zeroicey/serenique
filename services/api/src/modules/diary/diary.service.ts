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

/** Format a JS Date to YYYY-MM-DD. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Check that a date string is not in the future. */
function isFutureDate(dateStr: string): boolean {
  return dateStr > todayStr();
}

function toEntry(row: typeof diaries.$inferSelect): DiaryEntry {
  return {
    id: row.id,
    diaryDate: row.diaryDate,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const diaryService = {
  async create(input: CreateDiaryInput): Promise<DiaryEntry> {
    const diaryDate = input.diaryDate ?? todayStr();

    // Reject future dates
    if (isFutureDate(diaryDate)) {
      throw new AppError(ErrorCode.VALIDATION, "不能创建未来日期的日记", 400);
    }

    // One entry per day
    const [existing] = await db
      .select({ id: diaries.id })
      .from(diaries)
      .where(eq(diaries.diaryDate, diaryDate));
    if (existing) {
      throw new AppError(ErrorCode.VALIDATION, `${diaryDate} 的日记已存在`, 409);
    }

    const [row] = await db
      .insert(diaries)
      .values({ diaryDate, content: input.content })
      .returning();
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
