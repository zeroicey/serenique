import type { auditLogs } from '@/modules/audit/audit.schema'
import type { AuditLogEntry } from '@/modules/audit/audit.types'

// ---------------------------------------------------------------------------
// Audit mappers — row → entry conversion, pure functions.
// ---------------------------------------------------------------------------

export function toAuditLogEntry(row: typeof auditLogs.$inferSelect): AuditLogEntry {
  return {
    id: row.id,
    event: row.event,
    message: row.message,
    level: row.level,
    source: row.source,
    ip: row.ip,
    detail: row.detail,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  }
}
