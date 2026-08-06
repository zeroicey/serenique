import { z } from "zod";

// ---------------------------------------------------------------------------
// Moment comment module — request/response types for the moment sub-resource.
// Content is a self-comment (≤2000 chars), not bounded by the moment's 500.
// ---------------------------------------------------------------------------

export const CreateMomentCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

/** PUT partial update — content is the only updatable field. */
export const UpdateMomentCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export type CreateMomentCommentInput = z.input<typeof CreateMomentCommentSchema>;
export type UpdateMomentCommentInput = z.input<typeof UpdateMomentCommentSchema>;
export type ListMomentCommentsInput = { momentId: string };
export type GetMomentCommentInput = { momentId: string; commentId: string };
export type DeleteMomentCommentInput = { momentId: string; commentId: string };

export type MomentCommentEntry = {
  id: string;
  momentId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};
