// ---------------------------------------------------------------------------
// Application error — every error thrown in the service layer is an AppError.
// The handler layer catches these and converts them to HTTP responses.
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const ErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
