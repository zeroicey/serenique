import { z } from "zod";
import type { BlobEntry } from "@/modules/blob/blob.types";
import type { MomentCommentEntry } from "@/modules/moment/comment.types";
import type { TagEntry } from "@/modules/tag/tag.types";

// ---------------------------------------------------------------------------
// Moment module — request/response types
// ---------------------------------------------------------------------------

/**
 * Optional location attached to a moment (WeChat-style). All fields are
 * optional — the frontend decides what it collected; at least one field must
 * be present so an empty object is rejected.
 */
export const MomentLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.latitude !== undefined ||
      v.longitude !== undefined,
    { message: "位置对象至少需要 name、latitude、longitude 中的一个" },
  );

export const MomentAttachmentInputSchema = z.object({
  blobId: z.string().uuid(),
  role: z.string().min(1).max(64).default("attachment"),
  displayName: z.string().min(1).max(255).optional(),
  sortOrder: z.coerce.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const CreateMomentSchema = z.object({
  text: z.string().min(1).max(10000),
  attachments: z.array(MomentAttachmentInputSchema).default([]),
  /** Inline tag ids, bound in the same transaction (tag must exist). */
  tags: z.array(z.string().uuid()).default([]),
  /** Optional location; absent = no location. */
  location: MomentLocationSchema.optional(),
});

/**
 * PUT partial update — text is required, location is three-state:
 * absent = unchanged, null = clear, object = set/overwrite.
 */
export const UpdateMomentSchema = z.object({
  text: z.string().min(1).max(10000),
  location: MomentLocationSchema.nullable().optional(),
});

export const ListMomentSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  /** Filter by tag id (additive — MCP `.extend()` inherits it automatically). */
  tag: z.string().uuid().optional(),
});

export const AddMomentAttachmentSchema = MomentAttachmentInputSchema;

/** Moment nested tag binding body. */
export const AddMomentTagSchema = z.object({
  tagId: z.string().uuid(),
});

export type CreateMomentInput = z.input<typeof CreateMomentSchema>;
export type MomentLocation = z.infer<typeof MomentLocationSchema>;
export type ListMomentInput = z.infer<typeof ListMomentSchema>;
export type UpdateMomentBody = z.infer<typeof UpdateMomentSchema>;
export type DeleteMomentInput = { id: string };
export type GetMomentInput = { id: string };
export type UpdateMomentInput = { id: string } & UpdateMomentBody;
export type AddMomentAttachmentInput = z.input<typeof AddMomentAttachmentSchema>;
export type DeleteMomentAttachmentInput = {
  momentId: string;
  attachmentId: string;
};
export type AddMomentTagInput = z.input<typeof AddMomentTagSchema>;
export type RemoveMomentTagInput = { momentId: string; tagId: string };

export type MomentBlobEntry = Pick<
  BlobEntry,
  | "id"
  | "originalName"
  | "mimeType"
  | "size"
  | "metadata"
  | "width"
  | "height"
  | "duration"
  | "createdAt"
> & {
  fileUrl: string;
};

export type MomentAttachmentEntry = {
  id: string;
  blobId: string;
  role: string;
  displayName: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  blob: MomentBlobEntry;
};

export type MomentEntry = {
  id: string;
  text: string;
  location: MomentLocation | null;
  attachments: MomentAttachmentEntry[];
  comments: MomentCommentEntry[];
  commentCount: number;
  tags: TagEntry[];
  createdAt: string;
  updatedAt: string;
};
