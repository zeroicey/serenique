import { Hono } from "hono";
import { auditHandler } from "@/modules/audit/audit.handler";

// ---------------------------------------------------------------------------
// Audit router — read-side routes mounted under /api/audit/logs.
// ---------------------------------------------------------------------------

export const auditRouter = new Hono()
  .get("/audit/logs", auditHandler.list)
  .get("/audit/logs/unread-count", auditHandler.unreadCount)
  .put("/audit/logs/read", auditHandler.markRead);
