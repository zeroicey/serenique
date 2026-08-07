// ---------------------------------------------------------------------------
// Diary domain — pure date rules. No DB / IO imports.
// `now` / `today` are injectable so the future-date check is unit-testable
// without depending on the real clock.
//
// 时区口径：日记「今天」用服务器本地时区（`todayStr` 走本地 getter），与
// Web/移动端一致。凌晨时段（如 UTC+8 00:00–08:00）本地日期比 UTC 早一天，
// 用 UTC 会把本地「今天」当成未来日期拒绝（见 2026-08-08 worklog）。
// ---------------------------------------------------------------------------

/** Format a JS Date to YYYY-MM-DD in the server's local timezone. */
export function todayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Check that a date string is not in the future. */
export function isFutureDate(
  dateStr: string,
  today: string = todayStr(),
): boolean {
  return dateStr > today;
}
