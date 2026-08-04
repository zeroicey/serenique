import { z } from "zod";

// ---------------------------------------------------------------------------
// Diary module — request/response types
// ---------------------------------------------------------------------------

export const CreateDiarySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  mood: z.string().optional(),
  weather: z.string().optional(),
});

export const ListDiarySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const UpdateDiaryBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  mood: z.string().nullable().optional(),
  weather: z.string().nullable().optional(),
});

export type CreateDiaryInput = z.infer<typeof CreateDiarySchema>;
export type ListDiaryInput = z.infer<typeof ListDiarySchema>;
export type UpdateDiaryBody = z.infer<typeof UpdateDiaryBodySchema>;

// Service-layer types — id is always passed separately from the handler
export type GetDiaryInput = { id: string };
export type UpdateDiaryInput = { id: string } & UpdateDiaryBody;
export type DeleteDiaryInput = { id: string };

export type DiaryEntry = {
  id: string;
  title: string;
  content: string;
  mood: string | null;
  weather: string | null;
  createdAt: string;
  updatedAt: string;
};
