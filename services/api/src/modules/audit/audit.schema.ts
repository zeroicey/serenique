import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Audit log table — append-only server-side operation log.
//
// No updatedAt on purpose (like blobs): a log row's only mutable field is
// is_read (batch mark-read), so a row-level updatedAt carries no information.
// `detail` is an unvalidated jsonb payload (aligned with the blobs.metadata
// convention — consumers define their own shape).
// ---------------------------------------------------------------------------

export const AUDIT_LEVELS = ["info", "warn", "error"] as const;
export type AuditLevel = (typeof AUDIT_LEVELS)[number];

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    event: text("event").notNull(), // 事件类型 key，如 "auth.login"
    message: text("message").notNull(), // 人类可读中文消息
    level: text("level").$type<AuditLevel>().notNull().default("info"),
    source: text("source"), // 来源端：web / cli / mobile / unknown（尽力而为）
    ip: text("ip"), // 客户端 IP（登录类、401 事件必带）
    detail: jsonb("detail").$type<Record<string, unknown>>(), // 可扩展载荷（对齐 blob.metadata 约定，不校验）
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_audit_logs_created_at_desc").on(t.createdAt.desc()),
    index("idx_audit_logs_is_read_created_at_desc").on(
      t.isRead,
      t.createdAt.desc(),
    ),
    index("idx_audit_logs_event_created_at_desc").on(t.event, t.createdAt.desc()),
  ],
);
