import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { Paged } from '@/types/api'

// 服务端审计日志（audit）API 契约。后端接口未上线（2026-08-08 开发中），
// 类型对齐 `.ai/requirements/2026-08-08-audit-module.md` §3 / §6。
// 只读 + 置已读，无删除。

export const AUDIT_LEVELS = ['info', 'warn', 'error'] as const
export type AuditLevel = (typeof AUDIT_LEVELS)[number]

export interface AuditLogEntry {
  id: string
  event: string
  message: string
  level: AuditLevel
  source: string | null
  ip: string | null
  detail: Record<string, unknown> | null
  isRead: boolean
  createdAt: string
}

export interface ListAuditLogsParams {
  page?: number
  pageSize?: number
  level?: AuditLevel
  event?: string
  unreadOnly?: boolean
}

export interface AuditUnreadCount {
  unreadCount: number
}

export interface MarkAuditReadResult {
  updatedCount: number
  unreadCount: number
}

export async function listAuditLogs(params?: ListAuditLogsParams): Promise<Paged<AuditLogEntry>> {
  const searchParams: Record<string, string> = {
    page: String(params?.page ?? 1),
    pageSize: String(params?.pageSize ?? 20),
  }
  if (params?.level) searchParams.level = params.level
  if (params?.event) searchParams.event = params.event
  if (params?.unreadOnly) searchParams.unreadOnly = 'true'
  const res = await api.get(apiUrl('audit/logs'), { searchParams })
  return unwrap<Paged<AuditLogEntry>>(res)
}

export async function getAuditUnreadCount(): Promise<AuditUnreadCount> {
  const res = await api.get(apiUrl('audit/logs/unread-count'))
  return unwrap<AuditUnreadCount>(res)
}

// body { ids }：缺省 / 空数组 = 全部置已读（契约 §6）。
export async function markAuditRead(ids?: string[]): Promise<MarkAuditReadResult> {
  const body = ids && ids.length > 0 ? { ids } : {}
  const res = await api.put(apiUrl('audit/logs/read'), { json: body })
  return unwrap<MarkAuditReadResult>(res)
}
