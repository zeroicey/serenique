import { z } from "zod";
import { AUDIT_LEVELS, type AuditLevel } from "@/modules/audit/audit.schema";

// ---------------------------------------------------------------------------
// Audit module — request/response types + event registry.
// Events are the stable contract between write points and the read side; the
// AUDIT_EVENTS enum is the single source of truth for valid event keys.
// ---------------------------------------------------------------------------

export const AUDIT_EVENTS = [
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.unauthorized",
  "blob.upload",
  "blob.delete",
  "moment.delete",
  "task.delete",
  "task_group.delete",
  "event.delete",
  "tag.delete",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/** Write-side input — what a business service passes to auditService.record(). */
export const RecordAuditSchema = z.object({
  event: z.enum(AUDIT_EVENTS),
  message: z.string().trim().min(1).max(500),
  level: z.enum(AUDIT_LEVELS).default("info"),
  source: z.string().trim().min(1).max(20).optional(),
  ip: z.string().trim().min(1).max(64).optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

/** Read-side list query. */
export const ListAuditSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  level: z.enum(AUDIT_LEVELS).optional(),
  event: z.enum(AUDIT_EVENTS).optional(),
  // coerce.boolean() 会把 "false" 字符串也变成 true，这里显式枚举 "true"/"false"。
  unreadOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

/** Mark-read body. Empty array (or absent) → mark all as read; ids cap 500. */
export const MarkReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(500).optional(),
});

// ---- Input types (service layer) ------------------------------------------
// record 用 z.input（level 带 default，所以调用方可省略）；list 用 z.infer
// （page/pageSize 经 z.coerce 后服务层消费的是 number）。

export type RecordAuditInput = z.input<typeof RecordAuditSchema>;
export type ListAuditInput = z.infer<typeof ListAuditSchema>;
export type MarkReadInput = z.input<typeof MarkReadSchema>;

// ---- Entry types (response layer) — times are ISO strings -----------------

export type AuditLogEntry = {
  id: string;
  event: string;
  message: string;
  level: AuditLevel;
  source: string | null;
  ip: string | null;
  detail: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};
