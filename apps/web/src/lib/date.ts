// 日期工具：UTC 口径与后端一致（避免时区导致「今天」被判为未来日）。

/** 今天（UTC，YYYY-MM-DD）。 */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/** YYYY-MM-DD → MM-DD。 */
export function formatDateOnly(ymd: string): string {
  return ymd.slice(5)
}
