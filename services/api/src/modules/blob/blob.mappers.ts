import type { blobAttachments, blobs } from '@/modules/blob/blob.schema'
import type { BlobAttachmentEntry, BlobEntry } from '@/modules/blob/blob.types'

// ---------------------------------------------------------------------------
// Blob mappers — row → entry conversion. Pure functions, no DB / IO.
// storagePath is intentionally never exposed to clients.
// ---------------------------------------------------------------------------

export function toPublicBlobEntry(row: typeof blobs.$inferSelect, refCount = 0): BlobEntry {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    checksum: row.checksum,
    metadata: row.metadata as Record<string, unknown>,
    width: row.width,
    height: row.height,
    duration: row.duration,
    createdAt: row.createdAt.toISOString(),
    refCount,
  }
}

export function toBlobAttachmentEntry(
  row: typeof blobAttachments.$inferSelect,
): BlobAttachmentEntry {
  return {
    id: row.id,
    blobId: row.blobId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    role: row.role,
    displayName: row.displayName,
    sortOrder: row.sortOrder,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
