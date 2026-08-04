// ---------------------------------------------------------------------------
// Diary domain — pure date rules. No DB / IO imports.
// `today` is injectable so the future-date check is unit-testable without
// depending on the real clock.
// ---------------------------------------------------------------------------

/** Format a JS Date to YYYY-MM-DD (UTC). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Check that a date string is not in the future. */
export function isFutureDate(
  dateStr: string,
  today: string = todayStr(),
): boolean {
  return dateStr > today;
}
