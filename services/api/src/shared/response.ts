import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ---------------------------------------------------------------------------
// Unified API response — same shape for success and error.
// Only `success`, `code`, `message` are always present.
// `data` and `error` are omitted when undefined.
//
// Inspired by the serenique Java project's ApiResponse + ApiResponses pattern:
//   Res.success("msg").data(obj).status(201).build(c)
//   Res.ok("msg", data)
//   Res.notFound("msg").build(c)
// ---------------------------------------------------------------------------

// ---- Builder ---------------------------------------------------------------

class ResBuilder<T = never> {
  private _httpStatus: number;
  private _code: string;
  private _data: T | undefined;
  private _error: unknown;

  constructor(
    private _success: boolean,
    code: string,
    private _message: string,
    httpStatus: number,
  ) {
    this._code = code;
    this._httpStatus = httpStatus;
    this._data = undefined;
    this._error = undefined;
  }

  /** Attach payload data. Only appears in JSON when set. */
  data<D>(data: D): ResBuilder<D> {
    this._data = data;
    return this as unknown as ResBuilder<D>;
  }

  /** Attach error detail (validation issues, stack, etc.). Only appears in JSON when set. */
  error(err: unknown): this {
    this._error = err;
    return this;
  }

  /** Override HTTP status — the code is derived from the status. */
  status(httpStatus: number): this {
    this._httpStatus = httpStatus;
    if (!this._success) {
      this._code = statusToCode(httpStatus);
    }
    return this;
  }

  /** Build the Hono Response. Fields with undefined values are excluded from JSON. */
  build(c: Context): Response {
    const body: Record<string, unknown> = {
      success: this._success,
      code: this._code,
      message: this._message,
    };
    if (this._data !== undefined) body.data = this._data;
    if (this._error !== undefined) body.error = this._error;

    return c.json(body, this._httpStatus as ContentfulStatusCode) as unknown as Response;
  }
}

// ---- Status → code mapping -------------------------------------------------

function statusToCode(status: number): string {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 422: return "VALIDATION_FAILED";
    case 429: return "TOO_MANY_REQUESTS";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  }
}

// ---- Static factory --------------------------------------------------------

export const Res = {
  /** Start a success builder. */
  success(msg: string): ResBuilder<never> {
    return new ResBuilder(true, "SUCCESS", msg, 200);
  },

  /** Start an error builder. */
  error(msg: string): ResBuilder<never> {
    return new ResBuilder(false, "BAD_REQUEST", msg, 400);
  },

  // -- Success shortcuts --

  ok<T>(msg: string, data: T) {
    return new ResBuilder<T>(true, "SUCCESS", msg, 200).data(data);
  },

  created<T>(msg: string, data: T) {
    return new ResBuilder<T>(true, "SUCCESS", msg, 201).data(data);
  },

  noContent(msg: string) {
    return new ResBuilder(true, "SUCCESS", msg, 204);
  },

  // -- Error shortcuts --

  badRequest(msg: string) {
    return new ResBuilder(false, "BAD_REQUEST", msg, 400);
  },

  validationFailed(msg: string, err?: unknown) {
    const b = new ResBuilder(false, "VALIDATION_FAILED", msg, 400);
    if (err !== undefined) b.error(err);
    return b;
  },

  unauthorized(msg: string) {
    return new ResBuilder(false, "UNAUTHORIZED", msg, 401);
  },

  forbidden(msg: string) {
    return new ResBuilder(false, "FORBIDDEN", msg, 403);
  },

  notFound(msg: string) {
    return new ResBuilder(false, "NOT_FOUND", msg, 404);
  },

  conflict(msg: string) {
    return new ResBuilder(false, "CONFLICT", msg, 409);
  },

  internalError(msg = "Internal server error") {
    return new ResBuilder(false, "INTERNAL_ERROR", msg, 500);
  },
};
