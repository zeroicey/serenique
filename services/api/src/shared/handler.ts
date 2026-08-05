import type { Context } from "hono";
import { z, ZodError } from "zod";
import { AppError, ErrorCode } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { Res } from "@/shared/response";

// ---------------------------------------------------------------------------
// Shared HTTP handler helpers — the canonical error-mapping used by every
// module handler. Keep this in sync with the unified response contract:
// AppError → status from the error; ZodError → 400; malformed JSON → 400;
// anything else → 500.
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

/**
 * Read a `:param` path param and require it to be a valid UUID.
 *
 * Returns 400 VALIDATION for a missing param or a non-UUID value instead of
 * letting a malformed id reach the service/DB layer, where it would surface as
 * an unrelated 500. Handlers should use this for every `:id` / `:attachmentId`
 * param rather than reading `c.req.param()` directly. Same uuid() pattern the
 * MCP tool schemas use, so both channels reject bad ids identically.
 */
export function uuidParam(c: Context, name: string): string {
  const id = c.req.param(name);
  if (!id) {
    throw new AppError(ErrorCode.VALIDATION, `缺少 ${name} 参数`, 400);
  }
  return uuidSchema.parse(id);
}

export function handleError(e: unknown, c: Context, scope?: string): Response {
  if (e instanceof AppError) {
    return Res.error(e.message).status(e.status).build(c);
  }
  if (e instanceof ZodError) {
    return Res.validationFailed("参数校验失败", e.issues).build(c);
  }
  if (e instanceof SyntaxError) {
    return Res.badRequest("请求体必须是合法的 JSON").build(c);
  }
  logger.error({ err: e, scope }, "Unhandled error in handler");
  return Res.internalError().build(c);
}
