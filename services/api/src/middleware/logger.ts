import type { Context, Next } from 'hono'
import { c, isDevelopment, logger as pinoLogger } from '@/shared/logger'

// ---------------------------------------------------------------------------
// Request logger middleware.
//
// Development: rich colored console output with emoji indicators.
//   - HTTP method color-coded (GET=green, POST=cyan, PUT/PATCH=yellow, DELETE=red)
//   - Status emoji (2xx=✅, 3xx=↪️, 4xx=⚠️, 5xx=❌)
//   - Duration colored by speed (<50ms=⚡green, <200ms=yellow, >=200ms=🐢red)
//   - Timestamp in HH:MM:ss for quick scanning
//
// Production: structured JSON via pino for log aggregation.
// ---------------------------------------------------------------------------

function colorMethod(method: string): string {
  const padded = method.toUpperCase().padEnd(6)
  switch (method.toUpperCase()) {
    case 'GET':
      return c.green(padded)
    case 'POST':
      return c.cyan(padded)
    case 'PUT':
      return c.yellow(padded)
    case 'PATCH':
      return c.magenta(padded)
    case 'DELETE':
      return c.red(padded)
    default:
      return padded
  }
}

function statusInfo(status: number): string {
  if (status < 300) return c.green(`${status} ✅`)
  if (status < 400) return c.cyan(`${status} ↪️`)
  if (status < 500) return c.yellow(`${status} ⚠️`)
  return c.red(`${status} ❌`)
}

function durationInfo(ms: number): string {
  if (ms < 50) return c.green(`${ms}ms ⚡`)
  if (ms < 200) return c.yellow(`${ms}ms`)
  return c.red(`${ms}ms 🐢`)
}

// ---- Middleware ------------------------------------------------------------

export async function logger(ctx: Context, next: Next) {
  const start = Date.now()
  try {
    await next()
  } finally {
    const ms = Date.now() - start

    if (isDevelopment) {
      const now = ts()
      const method = colorMethod(ctx.req.method)
      const path = c.bold(ctx.req.path)
      const status = statusInfo(ctx.res.status)
      const dur = durationInfo(ms)
      console.log(`${c.gray(now)}  ${method}  ${path}  →  ${status}  ${dur}`)
    } else {
      pinoLogger.info(
        {
          method: ctx.req.method,
          path: ctx.req.path,
          status: ctx.res.status,
          ms,
        },
        `${ctx.req.method} ${ctx.req.path} → ${ctx.res.status} (${ms}ms)`,
      )
    }
  }
}

// ---- Helpers ---------------------------------------------------------------

function ts(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
