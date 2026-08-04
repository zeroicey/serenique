import { createHash } from "node:crypto";
import { mkdir, writeFile, unlink, readFile, readdir } from "node:fs/promises";
import { join, dirname, extname as nodeExtname, relative } from "node:path";
import { logger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Lightweight image dimension extraction from binary headers.
// No external dependencies — reads just enough bytes to parse the header.
// ---------------------------------------------------------------------------

function parseJPEG(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // SOF0 / SOF1 / SOF2
      if (offset + 8 > buf.length) return null;
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    // Skip this segment: 2 bytes marker + 2 bytes length
    if (offset + 4 > buf.length) return null;
    const segLen = buf.readUInt16BE(offset + 2);
    offset += 2 + segLen;
  }
  return null;
}

function parsePNG(buf: Buffer): { width: number; height: number } | null {
  // IHDR is always the first chunk, at offset 16 (8 sig + 4 len + 4 type)
  if (buf.length < 26) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function parseGIF(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  return {
    width: buf.readUInt16LE(6),
    height: buf.readUInt16LE(8),
  };
}

function parseWebP(buf: Buffer): { width: number; height: number } | null {
  // RIFF header at 0, WEBP at 8, then VP8 / VP8L / VP8X chunk
  if (buf.length < 30) return null;
  const chunk = buf.subarray(12, 16).toString();
  if (chunk === "VP8 " || chunk === "VP8X") {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

/**
 * Try to extract image dimensions from the first bytes of a buffer.
 * Supports JPEG, PNG, GIF, WebP. Returns null for unrecognized formats.
 */
export function extractImageDimensions(
  buf: Buffer,
): { width: number; height: number } | null {
  if (buf.length < 10) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) return parseJPEG(buf);
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return parsePNG(buf);
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return parseGIF(buf);
  // WebP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46)
    return parseWebP(buf);

  return null;
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// Storage path generation
// ---------------------------------------------------------------------------

/**
 * Build a relative storage path from MIME type and file extension.
 * Format: {mime-main-type}/{YYYY}/{MM}/{uuid}{ext}
 */
export function buildStoragePath(
  mimeType: string,
  id: string,
  originalName: string,
): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const type = mimeType.split("/")[0] ?? "unknown";
  const ext = nodeExtname(originalName);
  return join(type, year, month, `${id}${ext}`);
}

// ---------------------------------------------------------------------------
// Blob root directory initialization & validation
// ---------------------------------------------------------------------------

/**
 * Initialize the BLOB_ROOT directory.
 * - If it doesn't exist, create it (empty → valid).
 * - If it exists, verify every top-level entry is a directory (no bare files).
 */
export async function initBlobRoot(root: string): Promise<void> {
  try {
    await mkdir(root, { recursive: true });
  } catch (err) {
    throw new Error(`无法创建 BLOB_ROOT 目录: ${root} — ${String(err)}`);
  }

  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      throw new Error(
        `BLOB_ROOT 目录必须只包含子目录，发现文件: ${entry.name}`,
      );
    }
  }

  logger.info({ root }, "BLOB_ROOT 目录初始化完成");
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

/** Write a buffer to disk, creating parent directories as needed. */
export async function saveFile(
  root: string,
  filePath: string,
  buf: Buffer,
): Promise<void> {
  const absPath = join(root, filePath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, buf);
}

/** Read a file from the blob store. */
export async function readFileFromStorage(
  root: string,
  filePath: string,
): Promise<Buffer> {
  return readFile(join(root, filePath));
}

/** Delete a file from the blob store. Does not throw if file is missing. */
export async function deleteFileFromStorage(
  root: string,
  filePath: string,
): Promise<void> {
  try {
    await unlink(join(root, filePath));
  } catch (err) {
    // File already gone — nothing to do
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw err;
  }
}

/** List every regular file under the blob store as a relative storage path. */
export async function listStoragePaths(root: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (entry.isFile()) {
        paths.push(relative(root, absPath));
      }
    }
  }

  await walk(root);
  return paths.sort();
}
