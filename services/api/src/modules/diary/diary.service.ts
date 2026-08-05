import { db } from "@/db/connection";
import { diaries } from "@/modules/diary/diary.schema";
import { isFutureDate, todayStr } from "@/modules/diary/diary.domain";
import { toDiaryEntry } from "@/modules/diary/diary.mappers";
import type {
  CreateDiaryInput,
  DiaryEntry,
  GetDiaryInput,
  GetDiaryByDateInput,
  ListDiaryInput,
  UpdateDiaryInput,
  DeleteDiaryInput,
} from "@/modules/diary/diary.types";
import { AppError, ErrorCode } from "@/shared/errors";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Diary service — business orchestration over `db`.
// Date rules live in diary.domain.ts; row→entry mapping in diary.mappers.ts.
// ---------------------------------------------------------------------------

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
    return toDiaryEntry(row);
  },

  async list(input: ListDiaryInput): Promise<{ items: DiaryEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ count }]] = await Promise.all([
      db.select().from(diaries).orderBy(diaries.createdAt).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(diaries),
    ]);
    return { items: items.map(toDiaryEntry), total: count };
  },

  async get(input: GetDiaryInput): Promise<DiaryEntry> {
    const [row] = await db.select().from(diaries).where(eq(diaries.id, input.id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    return toDiaryEntry(row);
  },

  async getByDate(input: GetDiaryByDateInput): Promise<DiaryEntry> {
    const [row] = await db
      .select()
      .from(diaries)
      .where(eq(diaries.diaryDate, input.diaryDate));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    return toDiaryEntry(row);
  },

  async update(input: UpdateDiaryInput): Promise<DiaryEntry> {
    const { id, ...data } = input;
    const [row] = await db
      .update(diaries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(diaries.id, id))
      .returning();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "日记不存在", 404);
    return toDiaryEntry(row);
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
