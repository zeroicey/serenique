import { pinyin } from "pinyin-pro";
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

// ---------------------------------------------------------------------------
// Pinyin derived columns (global search) — see
// .ai/requirements/2026-08-13-moment-global-search.md. The exact pinyin-pro
// config below is validated against v3.28.2: toneType 'none' keeps the output
// pure ASCII, separator '' produces compact runs, nonZh 'consecutive' keeps
// English/digits verbatim instead of letter-splitting, v:true maps ü → v so
// typing "lv" matches 「吕」. Whitespace from consecutive runs is normalized.
// ---------------------------------------------------------------------------

const normalizePinyin = (s: string): string =>
  s.replace(/\s+/g, " ").trim().toLowerCase();

export type PinyinColumns = { pinyin: string; pinyinInitial: string };

/** Compute the two derived pinyin search columns for a moment's text. */
export function toPinyinColumns(text: string): PinyinColumns {
  return {
    pinyin: normalizePinyin(
      pinyin(text, {
        toneType: "none",
        separator: "",
        nonZh: "consecutive",
        v: true,
      }),
    ),
    pinyinInitial: normalizePinyin(
      pinyin(text, {
        pattern: "first",
        toneType: "none",
        separator: "",
        nonZh: "consecutive",
        v: true,
      }),
    ),
  };
}

/**
 * Escape ILIKE wildcards (% _ \) so user input is matched literally, then wrap
 * in %…% for substring matching. PostgreSQL default escape char is backslash.
 */
export function toLikePattern(keyword: string): string {
  const escaped = keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}
