import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { auditLogs } from "@/modules/audit/audit.schema";
import { toAuditLogEntry } from "@/modules/audit/audit.mappers";
import {
  buildEventMessage,
  unauthorizedRecord,
  unauthorizedShouldRecord,
  unauthorizedStateExpired,
  type UnauthorizedDedupState,
} from "@/modules/audit/audit.domain";
import type {
  AuditLogEntry,
  ListAuditInput,
  MarkReadInput,
  RecordAuditInput,
} from "@/modules/audit/audit.types";
import { env } from "@/env";
import { logger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Audit service — read-mostly, write-via-record singleton.
// Write points fire-and-forget (see fireAuditRecord): record() must never block
// or take down the main flow — a failed insert is logged to pino only.
//
// Sweep (retention) is a background maintenance task started from index.ts
// (aligned with initBlobRoot); NODE_ENV === "test" skips it.
// ---------------------------------------------------------------------------

export const auditService = {
  /**
   * Insert one audit log row. Fire-and-forget by design — callers use
   * fireAuditRecord() (or `void record().catch(...)`) so the main flow is
   * never blocked by an audit insert.
   */
  async record(input: RecordAuditInput): Promise<void> {
    await db.insert(auditLogs).values({
      event: input.event,
      message: input.message,
      level: input.level ?? "info",
      source: input.source ?? null,
      ip: input.ip ?? null,
      detail: input.detail ?? null,
    });
  },

  /** Paginated list, newest-first. Optional level / event / unread filters. */
  async list(
    input: ListAuditInput,
  ): Promise<{ items: AuditLogEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const conditions = [
      input.level ? eq(auditLogs.level, input.level) : undefined,
      input.event ? eq(auditLogs.event, input.event) : undefined,
      input.unreadOnly === true ? eq(auditLogs.isRead, false) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(where),
    ]);
    return { items: items.map(toAuditLogEntry), total: count };
  },

  /** Number of unread rows — Web badge polling target. */
  async unreadCount(): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(eq(auditLogs.isRead, false));
    return count;
  },

  /**
   * Mark logs read. Empty/absent ids → mark all; otherwise mark exactly the
   * given ids. Returns updated + remaining unread counts.
   */
  async markRead(
    input: MarkReadInput,
  ): Promise<{ updatedCount: number; unreadCount: number }> {
    let updatedCount = 0;
    if (input.ids && input.ids.length > 0) {
      const rows = await db
        .update(auditLogs)
        .set({ isRead: true })
        .where(inArray(auditLogs.id, input.ids))
        .returning({ id: auditLogs.id });
      updatedCount = rows.length;
    } else {
      // 空数组视为未提供 → 全部置已读
      const rows = await db
        .update(auditLogs)
        .set({ isRead: true })
        .where(eq(auditLogs.isRead, false))
        .returning({ id: auditLogs.id });
      updatedCount = rows.length;
    }
    const unreadCount = await this.unreadCount();
    return { updatedCount, unreadCount };
  },

  /**
   * Retention sweep — first delete rows older than AUDIT_RETENTION_DAYS, then
   * truncate to at most AUDIT_MAX_ROWS (keep the newest). Order matters: delete
   * by age first so truncation never leaves stale rows behind.
   */
  async sweep(): Promise<{ deletedByDays: number; deletedByRows: number }> {
    const retentionDays = env.AUDIT_RETENTION_DAYS ?? 90;
    const maxRows = env.AUDIT_MAX_ROWS ?? 5000;
    let deletedByDays = 0;
    let deletedByRows = 0;

    if (retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
      const deleted = await db
        .delete(auditLogs)
        .where(lt(auditLogs.createdAt, cutoff))
        .returning({ id: auditLogs.id });
      deletedByDays = deleted.length;
    }

    if (maxRows > 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs);
      const excess = count - maxRows;
      if (excess > 0) {
        const oldest = await db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .orderBy(asc(auditLogs.createdAt))
          .limit(excess);
        if (oldest.length > 0) {
          const deleted = await db
            .delete(auditLogs)
            .where(inArray(auditLogs.id, oldest.map((row) => row.id)))
            .returning({ id: auditLogs.id });
          deletedByRows = deleted.length;
        }
      }
    }

    return { deletedByDays, deletedByRows };
  },

  // ---- 401 per-IP dedup (in-memory, single-process) ------------------------

  _unauthorized: new Map<string, UnauthorizedDedupState>(),

  /** 清理已过窗口的去重记录，防止 Map 无限增长。 */
  _sweepUnauthorized(nowMs: number): void {
    for (const [ip, state] of this._unauthorized) {
      if (unauthorizedStateExpired(state, nowMs)) {
        this._unauthorized.delete(ip);
      }
    }
  },

  /**
   * Record an auth.unauthorized row, deduped per-IP within the window (default
   * 10 min). Returns true when a row was written, false when deduped. Fires the
   * insert asynchronously — never blocks the middleware.
   */
  recordUnauthorized(ip: string, nowMs = Date.now()): boolean {
    this._sweepUnauthorized(nowMs);
    const state = this._unauthorized.get(ip);
    if (!unauthorizedShouldRecord(state, nowMs)) return false;
    this._unauthorized.set(ip, unauthorizedRecord(state, nowMs));
    fireAuditRecord({
      event: "auth.unauthorized",
      message: buildEventMessage("auth.unauthorized"),
      level: "warn",
      ip,
    });
    return true;
  },
};

/** Fire-and-forget audit write — never awaited, failures only hit pino. */
export function fireAuditRecord(input: RecordAuditInput): void {
  void auditService.record(input).catch((err) => {
    logger.error({ err }, "audit record failed");
  });
}

export const AUDIT_SWEEP_INTERVAL_MS = 30 * 60_000; // 30 分钟

/** Start the background retention sweep. index.ts calls this (skip in test). */
export function startAuditSweeper(
  intervalMs = AUDIT_SWEEP_INTERVAL_MS,
): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    void auditService.sweep().catch((err) => {
      logger.error({ err }, "audit sweep failed");
    });
  }, intervalMs);
  // 不阻止进程退出（Bun/Node 均支持 Timer.unref）。
  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  return timer;
}
