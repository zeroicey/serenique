import { z } from "zod";

// ---------------------------------------------------------------------------
// Moment module — request/response types
// ---------------------------------------------------------------------------

export const CreateMomentSchema = z.object({
  content: z.string().min(1).max(500),
});

export const ListMomentSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateMomentInput = z.infer<typeof CreateMomentSchema>;
export type ListMomentInput = z.infer<typeof ListMomentSchema>;
export type DeleteMomentInput = { id: string };

export type MomentEntry = {
  id: string;
  content: string;
  createdAt: string;
};
