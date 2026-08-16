import type { DailyStatus, HabitKind } from '@/modules/habit/habit.schema'
import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Habit domain — pure business rules for daily writes and overview
// aggregation. No DB / IO imports, so these are unit-testable without a
// database.
// ---------------------------------------------------------------------------

// ---- Date helpers (pure string arithmetic on YYYY-MM-DD) ------------------

/** Format a Date as a local-timezone YYYY-MM-DD string. */
export function formatLocalDate(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Add `delta` days to a YYYY-MM-DD string (UTC math — timezone-safe). */
export function addDays(dateStr: string, delta: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + delta * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Start of the "last N days" window ending at `toDate` (inclusive). */
export function windowStart(toDate: string, days: number): string {
  return addDays(toDate, -(days - 1))
}

// ---- Daily write resolution ----------------------------------------------

export type DailyWritePatch = {
  status?: DailyStatus | null
  count?: number
}

/** Shape of the current daily row (or null when none exists yet). */
export type DailyRowLike = {
  status: DailyStatus | null
  count: number
}

export type DailyWriteResult = DailyRowLike

/**
 * Resolve a SetDaily patch into concrete row values, keyed by the habit's
 * recording mode:
 * - countable habit: only count allowed; a status in the patch → error.
 * - non-countable habit: only status allowed; a count in the patch → error.
 * Status/count: absent → keep current (null / 0 on insert).
 */
export function resolveDailyWrite(
  current: DailyRowLike | null,
  patch: DailyWritePatch,
  countable: boolean,
): DailyWriteResult {
  if (countable && patch.status !== undefined) {
    throw new AppError(ErrorCode.VALIDATION, '计数型习惯只支持记录次数，不支持做没做状态', 400)
  }
  if (!countable && patch.count !== undefined) {
    throw new AppError(ErrorCode.VALIDATION, '该习惯为做没做型，不支持记录次数', 400)
  }
  return {
    status: countable
      ? null
      : patch.status === undefined
        ? (current?.status ?? null)
        : patch.status,
    count: countable ? (patch.count === undefined ? (current?.count ?? 0) : patch.count) : 0,
  }
}

// ---- Overview aggregation -------------------------------------------------

export type HabitLike = {
  id: string
  name: string
  kind: HabitKind
  countable: boolean
  sortOrder: number
}

export type DailyLike = {
  habitId: string
  date: string
  status: DailyStatus | null
  count: number
}

export type OverviewDayEntry = {
  habitId: string
  name: string
  kind: HabitKind
  countable: boolean
  status: DailyStatus | null
  count: number
}

export type OverviewStatEntry = {
  habitId: string
  name: string
  kind: HabitKind
  countable: boolean
  doneDays: number
  notDoneDays: number
  totalCount: number
}

export type OverviewBody = {
  days: number
  fromDate: string
  toDate: string
  byDate: Record<string, OverviewDayEntry[]>
  stats: OverviewStatEntry[]
}

/**
 * Aggregate daily rows into the overview body:
 * - byDate: rows grouped by date, each enriched with habit name/kind and
 *   ordered by the habit's sort order (stable across groups).
 * - stats: one row per habit — doneDays / notDoneDays for non-countable
 *   (status-based) habits, doneDays = days with count>0 and totalCount =
 *   summed count for countable habits.
 */
export function buildOverview(
  habits: HabitLike[],
  dailies: DailyLike[],
  window: { days: number; fromDate: string; toDate: string },
): OverviewBody {
  const habitById = new Map(habits.map((h) => [h.id, h]))
  const order = new Map(habits.map((h, i) => [h.id, i]))

  const byDate: Record<string, OverviewDayEntry[]> = {}
  for (const d of dailies) {
    const habit = habitById.get(d.habitId)
    if (!habit) continue
    let bucket = byDate[d.date]
    if (!bucket) {
      bucket = []
      byDate[d.date] = bucket
    }
    bucket.push({
      habitId: d.habitId,
      name: habit.name,
      kind: habit.kind,
      countable: habit.countable,
      status: d.status,
      count: d.count,
    })
  }
  for (const bucket of Object.values(byDate)) {
    bucket.sort((a, b) => (order.get(a.habitId) ?? 0) - (order.get(b.habitId) ?? 0))
  }

  const stats: OverviewStatEntry[] = habits.map((h) => {
    const mine = dailies.filter((d) => d.habitId === h.id)
    if (h.countable) {
      return {
        habitId: h.id,
        name: h.name,
        kind: h.kind,
        countable: true,
        doneDays: mine.filter((d) => d.count > 0).length,
        notDoneDays: 0,
        totalCount: mine.reduce((sum, d) => sum + d.count, 0),
      }
    }
    return {
      habitId: h.id,
      name: h.name,
      kind: h.kind,
      countable: false,
      doneDays: mine.filter((d) => d.status === 'done').length,
      notDoneDays: mine.filter((d) => d.status === 'not_done').length,
      totalCount: 0,
    }
  })

  return {
    days: window.days,
    fromDate: window.fromDate,
    toDate: window.toDate,
    byDate,
    stats,
  }
}
