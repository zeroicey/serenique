import type { Context, Next } from "hono";
import { logger as pinoLogger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Pino-based request logger middleware.
// Logs method, path, status, and duration for every request.
// Also injects the pino instance into context so handlers can use it.
// ---------------------------------------------------------------------------

export async function logger(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  pinoLogger.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms,
  }, `${c.req.method} ${c.req.path} → ${c.res.status} (${ms}ms)`);
}
