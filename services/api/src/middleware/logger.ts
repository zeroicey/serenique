import type { Context, Next } from "hono";

// ---------------------------------------------------------------------------
// Request logger — logs method, path, status, and duration for every request.
// ---------------------------------------------------------------------------

export async function logger(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} → ${c.res.status} (${ms}ms)`);
}
