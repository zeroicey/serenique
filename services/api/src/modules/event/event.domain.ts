import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Event domain — pure rules for event time-range validation and partial-update
// resolution. No DB / IO imports, so these are unit-testable without a DB.
// ---------------------------------------------------------------------------

/** Shape of an event row the update resolver needs. */
export type EventRowLike = {
  title: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  location: string | null;
  note: string | null;
};

/** Partial update fields accepted by resolveEventUpdate. */
export type EventUpdatePatch = {
  title?: string;
  startAt?: Date;
  endAt?: Date;
  isAllDay?: boolean;
  location?: string;
  note?: string;
};

/** Result of resolving an event update: the next row values. */
export type EventUpdateResult = EventRowLike;

/** Throw VALIDATION unless endAt is strictly after startAt. */
export function assertValidEventRange(startAt: Date, endAt: Date): void {
  if (endAt.getTime() <= startAt.getTime()) {
    throw new AppError(
      ErrorCode.VALIDATION,
      "结束时间必须晚于开始时间",
      400,
    );
  }
}

/** Throw VALIDATION unless the list window [from, to) is well-formed. */
export function assertValidListRange(from: Date, to: Date): void {
  if (to.getTime() <= from.getTime()) {
    throw new AppError(
      ErrorCode.VALIDATION,
      "查询时间范围无效：结束时间必须晚于开始时间",
      400,
    );
  }
}

/**
 * Combine an event update patch with the current row, returning the next row
 * values. Only fields present in the patch change; a present location / note
 * replaces the current value (an empty string clears it). Rejects the result if
 * the merged time range is invalid.
 */
export function resolveEventUpdate(
  current: EventRowLike,
  patch: EventUpdatePatch,
): EventUpdateResult {
  const resolved: EventUpdateResult = {
    title: patch.title ?? current.title,
    startAt: patch.startAt ?? current.startAt,
    endAt: patch.endAt ?? current.endAt,
    isAllDay: patch.isAllDay ?? current.isAllDay,
    location: patch.location !== undefined ? patch.location : current.location,
    note: patch.note !== undefined ? patch.note : current.note,
  };
  assertValidEventRange(resolved.startAt, resolved.endAt);
  return resolved;
}
