import { and, asc, eq, gte, lte, max, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { fireAuditRecord } from '@/modules/audit/audit.service'
import type { OverviewBody } from '@/modules/habit/habit.domain'
import {
  addDays,
  buildOverview,
  formatLocalDate,
  resolveDailyWrite,
} from '@/modules/habit/habit.domain'
import { toDailyEntry, toHabitEntry } from '@/modules/habit/habit.mappers'
import { habitDaily, habits } from '@/modules/habit/habit.schema'
import type {
  ClearDailyInput,
  CreateHabitInput,
  DeleteHabitInput,
  HabitEntry,
  ListDailyInput,
  OverviewInput,
  SetDailyInput,
  UpdateHabitInput,
} from '@/modules/habit/habit.types'
import { DailyDateSchema } from '@/modules/habit/habit.types'
import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Habit service — business orchestration over `db`.
//
// Mode validation (countable vs status/count) and overview aggregation are
// pure and live in habit.domain.ts; this file only wires them into queries.
// ---------------------------------------------------------------------------

/** Throw NOT_FOUND unless a habit with the given id exists. */
async function assertHabitExists(habitId: string): Promise<void> {
  const [habit] = await db.select({ id: habits.id }).from(habits).where(eq(habits.id, habitId))
  if (!habit) {
    throw new AppError(ErrorCode.NOT_FOUND, '习惯不存在', 404)
  }
}

export const habitService = {
  // ---- Habit options ----

  async createHabit(input: CreateHabitInput): Promise<HabitEntry> {
    const [row] = await db
      .insert(habits)
      .values({
        name: input.name,
        description: input.description ?? null,
        kind: input.kind,
        countable: input.countable ?? false,
      })
      .returning()
    return toHabitEntry(row)
  },

  /** 轻量聚合：习惯表条数 + 最新 updated_at（AI 动态快照指纹用，单条聚合查询）。 */
  async snapshotStats(): Promise<{ count: number; updatedAt: Date | null }> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int`, updatedAt: max(habits.updatedAt) })
      .from(habits)
    return { count: row.count, updatedAt: row.updatedAt }
  },

  async listHabits(): Promise<HabitEntry[]> {
    const rows = await db
      .select()
      .from(habits)
      .orderBy(asc(habits.sortOrder), asc(habits.createdAt))
    return rows.map(toHabitEntry)
  },

  async updateHabit(input: UpdateHabitInput): Promise<HabitEntry> {
    const { id, ...patch } = input
    const [row] = await db
      .update(habits)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(habits.id, id))
      .returning()
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '习惯不存在', 404)
    return toHabitEntry(row)
  },

  async deleteHabit(input: DeleteHabitInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(habits)
      .where(eq(habits.id, input.id))
      .returning({ id: habits.id, name: habits.name })
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '习惯不存在', 404)
    fireAuditRecord({
      event: 'habit.delete',
      message: '习惯已删除（含全部每日记录）',
      level: 'warn',
      detail: { id: row.id, name: row.name },
    })
    return { id: row.id }
  },

  // ---- Daily records ----

  async listDaily(input: ListDailyInput): Promise<ReturnType<typeof toDailyEntry>[]> {
    const rows = await db
      .select()
      .from(habitDaily)
      .where(eq(habitDaily.date, input.date))
      .orderBy(asc(habitDaily.createdAt))
    return rows.map(toDailyEntry)
  },

  async setDaily(input: SetDailyInput): Promise<ReturnType<typeof toDailyEntry>> {
    // 防御性校验：AI 工具直连 service 会绕过 handler 的 DailyDateSchema.parse，
    // 这里兜底，非法日期不落库（否则破坏 UNIQUE 与 overview 的范围查询）。
    if (!DailyDateSchema.safeParse(input.date).success) {
      throw new AppError(ErrorCode.VALIDATION, '日期无效', 400)
    }
    const [habit] = await db
      .select({ id: habits.id, countable: habits.countable })
      .from(habits)
      .where(eq(habits.id, input.habitId))
    if (!habit) throw new AppError(ErrorCode.NOT_FOUND, '习惯不存在', 404)

    const current = await db
      .select()
      .from(habitDaily)
      .where(and(eq(habitDaily.habitId, input.habitId), eq(habitDaily.date, input.date)))
      .limit(1)

    const { status, count } = resolveDailyWrite(current[0] ?? null, input, habit.countable)

    if (current[0]) {
      const [row] = await db
        .update(habitDaily)
        .set({ status, count, updatedAt: new Date() })
        .where(and(eq(habitDaily.habitId, input.habitId), eq(habitDaily.date, input.date)))
        .returning()
      return toDailyEntry(row)
    }
    const [row] = await db
      .insert(habitDaily)
      .values({ habitId: input.habitId, date: input.date, status, count })
      .returning()
    return toDailyEntry(row)
  },

  async clearDaily(input: ClearDailyInput): Promise<{ habitId: string; date: string }> {
    await assertHabitExists(input.habitId)
    const [row] = await db
      .delete(habitDaily)
      .where(and(eq(habitDaily.habitId, input.habitId), eq(habitDaily.date, input.date)))
      .returning({ id: habitDaily.id })
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '当日记录不存在', 404)
    return { habitId: input.habitId, date: input.date }
  },

  /** habit_daily 最新一条记录的 updatedAt（打卡/清打卡会推进；无记录为 null）。
   *  轻量查询（MAX 聚合），供 AI 动态快照的习惯段指纹使用——habits 表本身的
   *  updatedAt 在打卡时不变，单靠它无法发现每日记录变化。 */
  async latestDailyUpdatedAt(): Promise<Date | null> {
    const [row] = await db.select({ latest: max(habitDaily.updatedAt) }).from(habitDaily)
    return row.latest ?? null
  },

  // ---- Overview ----

  async overview(input: OverviewInput): Promise<OverviewBody> {
    const toDate = formatLocalDate(new Date())
    const fromDate = addDays(toDate, -(input.days - 1))
    const [habitRows, dailyRows] = await Promise.all([
      db.select().from(habits).orderBy(asc(habits.sortOrder), asc(habits.createdAt)),
      db
        .select()
        .from(habitDaily)
        .where(and(gte(habitDaily.date, fromDate), lte(habitDaily.date, toDate))),
    ])
    return buildOverview(habitRows, dailyRows, { days: input.days, fromDate, toDate })
  },
}
