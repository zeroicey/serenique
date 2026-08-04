import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Moment domain — pure rules for moment media attachments.
// No DB / IO imports, so these are unit-testable without a database.
// ---------------------------------------------------------------------------

export const MOMENT_ATTACHMENT_OWNER_TYPE = "moment";

function normalizedMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
}

/** Moments may only attach media blobs (image/audio/video), not SVG. */
export function isAllowedMomentMimeType(mimeType: string): boolean {
  const normalized = normalizedMimeType(mimeType);
  if (normalized === "image/svg+xml") return false;
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/")
  );
}

/** Throw VALIDATION unless the blob's mime type is allowed for moments. */
export function assertAllowedMomentBlob(blob: { mimeType: string }): void {
  if (!isAllowedMomentMimeType(blob.mimeType)) {
    throw new AppError(
      ErrorCode.VALIDATION,
      "闪念附件仅支持图片、音频和视频，且不支持 SVG",
      400,
    );
  }
}

/** Coerce an optional sortOrder value to an integer, or fall back. */
export function normalizeSortOrder(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const sortOrder = Number(value);
  if (!Number.isInteger(sortOrder)) {
    throw new AppError(ErrorCode.VALIDATION, "附件排序值必须是整数", 400);
  }
  return sortOrder;
}
