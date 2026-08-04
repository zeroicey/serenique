import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Blob domain — pure rules: HMAC signing, MIME sniffing, error-code guards.
// No DB / IO imports, so these are unit-testable without a database or disk.
// ---------------------------------------------------------------------------

/** Business owner types that must manage attachments through their own module API. */
export const RESERVED_OWNER_TYPES = new Set(["moment"]);

/**
 * True when the error is a checksum unique-constraint violation (dedup race).
 * drizzle-orm wraps the driver error in a DrizzleQueryError with the original
 * PostgresError under `.cause`; the raw driver reports the constraint as
 * `constraint` (and the PG server as `constraint_name`) — unwrap and check both.
 */
export function isChecksumUniqueConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const cause = (err as { cause?: unknown }).cause ?? err;
  if (!cause || typeof cause !== "object") return false;
  const e = cause as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
  };
  return (
    e.code === "23505" &&
    (e.constraint === "blobs_checksum_unique" ||
      e.constraint_name === "blobs_checksum_unique")
  );
}

/** Throw VALIDATION/413 when a file exceeds the configured upload limit. */
export function assertBlobSize(size: number, maxSize: number): void {
  if (size > maxSize) {
    throw new AppError(
      ErrorCode.VALIDATION,
      `文件大小不能超过 ${Math.round(maxSize / 1024 / 1024)} MB`,
      413,
    );
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Validate BLOB_SIGNING_SECRET is configured; return it or throw 500. */
export function requireSigningSecret(secret: string | undefined): string {
  if (!secret) {
    throw new AppError(
      ErrorCode.INTERNAL,
      "未配置 BLOB_SIGNING_SECRET，无法生成临时访问链接",
      500,
    );
  }
  return secret;
}

export function signBlobAccess(
  secret: string,
  blobId: string,
  expires: number,
): string {
  return createHmac("sha256", secret)
    .update(`${blobId}.${expires}`)
    .digest("base64url");
}

/** Constant-time signature comparison. */
export function signaturesEqual(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual);
  const expectedBuf = Buffer.from(expected);
  return (
    actualBuf.length === expectedBuf.length &&
    timingSafeEqual(actualBuf, expectedBuf)
  );
}

/** Detect a hand-written SVG (which can carry scripts) from its text header. */
export function looksLikeSvg(buf: Buffer): boolean {
  const header = buf
    .subarray(0, Math.min(buf.length, 1024))
    .toString("utf8")
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();

  return (
    header.startsWith("<svg") ||
    (header.startsWith("<?xml") && header.includes("<svg"))
  );
}

/** Normalize the uploaded MIME type, overriding with SVG sniffing when needed. */
export function normalizeUploadedMimeType(
  file: { type: string },
  buf: Buffer,
): string {
  if (looksLikeSvg(buf)) return "image/svg+xml";
  return file.type || "application/octet-stream";
}

/** Reject creating/deleting attachments for reserved business owner types. */
export function assertGenericAttachmentOwnerType(ownerType: string) {
  if (RESERVED_OWNER_TYPES.has(ownerType)) {
    throw new AppError(
      ErrorCode.VALIDATION,
      "该业务类型的附件请使用对应模块 API 创建或删除",
      400,
    );
  }
}
