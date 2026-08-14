import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// ---------------------------------------------------------------------------
// Unified API response — same shape for success and error.
// Only `success` and `message` are always present.
// `code` is present on error responses (set by error builders / handleError).
// `data` and `error` are omitted when undefined.
//
// Inspired by the serenique Java project's ApiResponse + ApiResponses pattern:
//   Res.success("msg").data(obj).status(201).build(c)
//   Res.ok("msg", data)
//   Res.notFound("msg").build(c)
// ---------------------------------------------------------------------------

// ---- Builder ---------------------------------------------------------------

class ResBuilder<_T = never> {
  private _httpStatus: number
  private _data: unknown
  private _error: unknown
  private _code: string | undefined

  constructor(
    private _success: boolean,
    private _message: string,
    httpStatus: number,
  ) {
    this._httpStatus = httpStatus
    this._data = undefined
    this._error = undefined
    this._code = undefined
  }

  /** Attach payload data. Only appears in JSON when set. */
  data<D>(data: D): ResBuilder<D> {
    this._data = data
    return this as unknown as ResBuilder<D>
  }

  /** Attach error detail (validation issues, stack, etc.). Only appears in JSON when set. */
  error(err: unknown): this {
    this._error = err
    return this
  }

  /** Attach an error code (e.g. NOT_FOUND, VALIDATION). Only appears in JSON when set. */
  code(code: string): this {
    this._code = code
    return this
  }

  /** Override HTTP status. */
  status(httpStatus: number): this {
    this._httpStatus = httpStatus
    return this
  }

  /** Build the Hono Response. Fields with undefined values are excluded from JSON. */
  build(c: Context): Response {
    // 204 No Content must not carry a body or Content-Type (RFC 9110).
    if (this._httpStatus === 204) {
      return c.body(null, 204)
    }

    const body: Record<string, unknown> = {
      success: this._success,
      message: this._message,
    }
    if (this._code !== undefined) body.code = this._code
    if (this._data !== undefined) body.data = this._data
    if (this._error !== undefined) body.error = this._error

    return c.json(body, this._httpStatus as ContentfulStatusCode) as unknown as Response
  }
}

// ---- Static factory --------------------------------------------------------

export const Res = {
  /** Start a success builder. */
  success(msg: string): ResBuilder<never> {
    return new ResBuilder(true, msg, 200)
  },

  /** Start an error builder. */
  error(msg: string): ResBuilder<never> {
    return new ResBuilder(false, msg, 400)
  },

  // -- Success shortcuts --

  ok<T>(msg: string, data: T) {
    return new ResBuilder<T>(true, msg, 200).data(data)
  },

  created<T>(msg: string, data: T) {
    return new ResBuilder<T>(true, msg, 201).data(data)
  },

  noContent(msg: string) {
    return new ResBuilder(true, msg, 204)
  },

  // -- Error shortcuts --

  badRequest(msg: string) {
    return new ResBuilder(false, msg, 400).code('VALIDATION')
  },

  validationFailed(msg: string, err?: unknown) {
    const b = new ResBuilder(false, msg, 400).code('VALIDATION')
    if (err !== undefined) b.error(err)
    return b
  },

  unauthorized(msg: string) {
    return new ResBuilder(false, msg, 401).code('UNAUTHORIZED')
  },

  forbidden(msg: string) {
    return new ResBuilder(false, msg, 403).code('FORBIDDEN')
  },

  notFound(msg: string) {
    return new ResBuilder(false, msg, 404).code('NOT_FOUND')
  },

  conflict(msg: string) {
    return new ResBuilder(false, msg, 409).code('CONFLICT')
  },

  internalError(msg = 'Internal server error') {
    return new ResBuilder(false, msg, 500).code('INTERNAL')
  },
}
