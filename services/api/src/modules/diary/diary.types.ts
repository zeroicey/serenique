import { z } from "zod";

// ---------------------------------------------------------------------------
// Diary module — request/response types
// ---------------------------------------------------------------------------

/** YYYY-MM-DD date string validation. */
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const CreateDiarySchema = z.object({
  content: z.string().min(1),
  diaryDate: z
    .string()
    .regex(dateRegex, "日期格式必须为 YYYY-MM-DD")
    .optional(),
});

export const ListDiarySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const UpdateDiaryBodySchema = z.object({
  content: z.string().min(1),
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
  diaryDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};
