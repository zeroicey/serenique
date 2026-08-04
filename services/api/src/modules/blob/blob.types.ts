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

export const CreateBlobAccessLinkSchema = z.object({
  expiresInSeconds: z.coerce
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60 * 60)
    .default(15 * 60),
});

export type ListBlobInput = z.infer<typeof ListBlobSchema>;
export type CreateBlobAccessLinkInput = z.infer<
  typeof CreateBlobAccessLinkSchema
>;
// Explicit structural input type (not z.input): sortOrder uses z.coerce, which
// would make z.input resolve to `unknown`. Defaulted fields stay optional so
// callers can pass bare objects; the service applies the defaults.
export type CreateBlobAttachmentInput = {
  ownerType: string;
  ownerId: string;
  role?: string;
  displayName?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

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

export type BlobAccessLinkEntry = {
  url: string;
  path: string;
  expires: number;
  expiresAt: string;
  signature: string;
};

export type BlobCleanupResult = {
  checked: number;
  deleted: string[];
  failed: Array<{
    path: string;
    message: string;
  }>;
};
