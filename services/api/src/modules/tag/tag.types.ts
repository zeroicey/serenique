import { z } from 'zod'

// ---------------------------------------------------------------------------
// Tag module — request/response types
// ---------------------------------------------------------------------------

export const TagNameSchema = z.string().trim().min(1).max(32)

export const CreateTagSchema = z.object({
  name: TagNameSchema,
})

export const RenameTagSchema = z.object({
  name: TagNameSchema,
})

export const ListTagSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

/** Generic attach/detach body — ownerType validated by the domain registry. */
export const AttachTagSchema = z.object({
  ownerType: z.string().trim().min(1).max(32),
  ownerId: z.string().trim().min(1).max(64),
})

export const DetachTagSchema = AttachTagSchema

/** PUT replace-all body (idempotent set semantics). */
export const ReplaceTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
})

// ---- Input types (service layer) ------------------------------------------
// z.input keeps defaulted fields optional so MCP can pass bare objects.
// List inputs use z.infer: z.coerce produces an `unknown` input type for
// page/pageSize, so the parsed (number) type is what the service consumes.

export type CreateTagInput = z.input<typeof CreateTagSchema>
export type RenameTagInput = { id: string } & z.input<typeof RenameTagSchema>
export type ListTagInput = z.infer<typeof ListTagSchema>
export type GetTagInput = { id: string }
export type DeleteTagInput = { id: string }
export type AttachTagInput = { tagId: string } & z.input<typeof AttachTagSchema>
export type DetachTagInput = { tagId: string } & z.input<typeof DetachTagSchema>
export type ReplaceTagsInput = z.input<typeof ReplaceTagsSchema> & {
  ownerType: string
  ownerId: string
}

// ---- Entry types (response layer) — times are ISO strings -----------------

export type TagEntry = {
  id: string
  name: string
  /** Number of moments currently bound to this tag (current sole ownerType). */
  momentCount: number
  createdAt: string
  updatedAt: string
}

export type TagRelationEntry = {
  id: string
  tagId: string
  ownerType: string
  ownerId: string
  createdAt: string
}
