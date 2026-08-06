import type { blobs, blobAttachments } from "@/modules/blob/blob.schema";
import type { moments } from "@/modules/moment/moment.schema";
import type { MomentCommentEntry } from "@/modules/moment/comment.types";
import type {
  MomentAttachmentEntry,
  MomentBlobEntry,
  MomentEntry,
} from "@/modules/moment/moment.types";

// ---------------------------------------------------------------------------
// Moment mappers — row → entry conversion and attachment grouping/sorting.
// Pure functions, no DB / IO.
// ---------------------------------------------------------------------------

export type MomentAttachmentJoinRow = {
  attachment: typeof blobAttachments.$inferSelect;
  blob: typeof blobs.$inferSelect;
};

export function toMomentBlobEntry(row: typeof blobs.$inferSelect): MomentBlobEntry {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    metadata: row.metadata as Record<string, unknown>,
    width: row.width,
    height: row.height,
    duration: row.duration,
    createdAt: row.createdAt.toISOString(),
    fileUrl: `/api/blobs/${row.id}/file`,
  };
}

export function toMomentAttachmentEntry({
  attachment,
  blob,
}: MomentAttachmentJoinRow): MomentAttachmentEntry {
  return {
    id: attachment.id,
    blobId: attachment.blobId,
    role: attachment.role,
    displayName: attachment.displayName,
    sortOrder: attachment.sortOrder,
    metadata: attachment.metadata as Record<string, unknown>,
    createdAt: attachment.createdAt.toISOString(),
    updatedAt: attachment.updatedAt.toISOString(),
    blob: toMomentBlobEntry(blob),
  };
}

/** Sort a copy of the attachments by (sortOrder, createdAt, id) — never mutates. */
export function sortAttachments(
  attachments: MomentAttachmentEntry[],
): MomentAttachmentEntry[] {
  return [...attachments].sort((a, b) => {
    const order = a.sortOrder - b.sortOrder;
    if (order !== 0) return order;
    const created = a.createdAt.localeCompare(b.createdAt);
    if (created !== 0) return created;
    return a.id.localeCompare(b.id);
  });
}

/** Group join rows by owner moment id, sorting each group. */
export function groupAttachmentsByMomentId(
  rows: MomentAttachmentJoinRow[],
): Map<string, MomentAttachmentEntry[]> {
  const grouped = new Map<string, MomentAttachmentEntry[]>();

  for (const row of rows) {
    const ownerId = row.attachment.ownerId;
    const group = grouped.get(ownerId) ?? [];
    group.push(toMomentAttachmentEntry(row));
    grouped.set(ownerId, group);
  }

  for (const [ownerId, attachments] of grouped) {
    grouped.set(ownerId, sortAttachments(attachments));
  }

  return grouped;
}

export function toMomentEntry(
  row: typeof moments.$inferSelect,
  attachments: MomentAttachmentEntry[] = [],
  comments: MomentCommentEntry[] = [],
  commentCount: number = comments.length,
): MomentEntry {
  return {
    id: row.id,
    text: row.text,
    attachments,
    comments,
    commentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
