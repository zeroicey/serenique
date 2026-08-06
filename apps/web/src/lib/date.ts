// 日期工具：UTC 口径与后端一致（避免时区导致「今天」被判为未来日）。

/** 今天（UTC，YYYY-MM-DD）。 */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 今天（本地时区，YYYY-MM-DD）。事件单日视图用本地日界。 */
export function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** YYYY-MM-DD → MM-DD。 */
export function formatDateOnly(ymd: string): string {
  return ymd.slice(5)
}
