import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Shared client-IP extraction — used by the auth handler (login/logout events)
// and the auth middleware (401 unauthorized events) so both record the same IP.
//
// Reads the reverse-proxy / direct-connection headers directly: Cloudflare
// first, then the first x-forwarded-for hop, then a fallback. In production the
// API sits behind Cloudflare which overwrites these headers, so they are
// trustworthy there; on a direct connection a client could spoof them (which
// would pollute the audit log and the per-IP dedup) — an accepted trade-off
// documented in the audit requirements.
// ---------------------------------------------------------------------------

export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
