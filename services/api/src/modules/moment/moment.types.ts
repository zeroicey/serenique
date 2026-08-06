import { z } from "zod";
import type { BlobEntry } from "@/modules/blob/blob.types";
import type { MomentCommentEntry } from "@/modules/moment/comment.types";

// ---------------------------------------------------------------------------
// Moment module — request/response types
// ---------------------------------------------------------------------------

export const MomentAttachmentInputSchema = z.object({
  blobId: z.string().uuid(),
  role: z.string().min(1).max(64).default("attachment"),
  displayName: z.string().min(1).max(255).optional(),
  sortOrder: z.coerce.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const CreateMomentSchema = z.object({
  text: z.string().min(1).max(500),
  attachments: z.array(MomentAttachmentInputSchema).default([]),
});

export const ListMomentSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const AddMomentAttachmentSchema = MomentAttachmentInputSchema;

export type CreateMomentInput = z.input<typeof CreateMomentSchema>;
export type ListMomentInput = z.infer<typeof ListMomentSchema>;
export type DeleteMomentInput = { id: string };
export type GetMomentInput = { id: string };
export type AddMomentAttachmentInput = z.input<typeof AddMomentAttachmentSchema>;
export type DeleteMomentAttachmentInput = {
  momentId: string;
  attachmentId: string;
};

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
  attachments: MomentAttachmentEntry[];
  comments: MomentCommentEntry[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};
