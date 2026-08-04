import { z } from "zod";

// ---------------------------------------------------------------------------
// Request validation schemas
// ---------------------------------------------------------------------------

export const ListBlobSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  /** Filter by MIME type prefix, e.g. "image/" shows all image subtypes. */
  mimeType: z.string().optional(),
});

export const CreateBlobAttachmentSchema = z.object({
  ownerType: z.string().min(1).max(64),
  ownerId: z.string().min(1).max(128),
  role: z.string().min(1).max(64).default("attachment"),
  displayName: z.string().min(1).max(255).optional(),
  sortOrder: z.coerce.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ListBlobInput = z.infer<typeof ListBlobSchema>;
export type CreateBlobAttachmentInput = z.infer<
  typeof CreateBlobAttachmentSchema
>;

// ---------------------------------------------------------------------------
// Response / domain types
// ---------------------------------------------------------------------------

export type BlobEntry = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  metadata: Record<string, unknown>;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
};

export type BlobAttachmentEntry = {
  id: string;
  blobId: string;
  ownerType: string;
  ownerId: string;
  role: string;
  displayName: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BlobFile = {
  body: Blob;
  mimeType: string;
  filename: string;
  size: number;
};

export type BlobCleanupResult = {
  checked: number;
  deleted: string[];
  failed: Array<{
    path: string;
    message: string;
  }>;
};
