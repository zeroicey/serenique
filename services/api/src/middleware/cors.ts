import { cors as honoCors } from "hono/cors";

// ---------------------------------------------------------------------------
// CORS middleware — allow all origins in development, configure in production.
// ---------------------------------------------------------------------------

export function cors() {
  return honoCors({
    origin: process.env.CORS_ORIGIN ?? "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  });
}
