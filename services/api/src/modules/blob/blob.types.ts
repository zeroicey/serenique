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

export type ListBlobInput = z.infer<typeof ListBlobSchema>;

// ---------------------------------------------------------------------------
// Response / domain types
// ---------------------------------------------------------------------------

export type BlobEntry = {
  id: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  checksum: string;
  metadata: Record<string, unknown>;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
};
