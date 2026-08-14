import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { toMomentCommentEntry } from '@/modules/moment/comment.mappers'
import { momentComments } from '@/modules/moment/comment.schema'
import type {
  CreateMomentCommentInput,
  DeleteMomentCommentInput,
  GetMomentCommentInput,
  ListMomentCommentsInput,
  MomentCommentEntry,
  UpdateMomentCommentInput,
} from '@/modules/moment/comment.types'
import { moments } from '@/modules/moment/moment.schema'
import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Moment comment service — CRUD over `moment_comments`, a sub-resource of
// moments (nested under /api/moments/:id/comments). Owned by the moment module
// (decision ⑧): no separate top-level module, no own router. Reads use the
// same one-inArray-batch pattern as moment attachments so detail embeds
// comments[] and list embeds commentCount with two queries, not N+1.
// ---------------------------------------------------------------------------

/** Minimal query client — either the singleton `db` or a drizzle transaction. */
type DbClient = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

/** Batch-load comments for many moment ids, ascending by (created_at, id). */
export async function listCommentsByMomentIds(
  client: DbClient,
  ids: string[],
): Promise<MomentCommentEntry[]> {
  if (ids.length === 0) return []
  const rows = await client
    .select()
    .from(momentComments)
    .where(inArray(momentComments.momentId, ids))
    .orderBy(momentComments.createdAt, momentComments.id)
  return rows.map(toMomentCommentEntry)
}

/** Batch-count comments grouped by moment id (for list commentCount). */
export async function listCommentCountsByMomentIds(
  client: DbClient,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await client
    .select({
      momentId: momentComments.momentId,
      count: sql<number>`count(*)::int`,
    })
    .from(momentComments)
    .where(inArray(momentComments.momentId, ids))
    .groupBy(momentComments.momentId)
  return new Map(rows.map((row) => [row.momentId, row.count]))
}

async function assertMomentExists(client: DbClient, momentId: string): Promise<void> {
  const [row] = await client
    .select({ id: moments.id })
    .from(moments)
    .where(eq(moments.id, momentId))
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念不存在', 404)
}

/** Find a comment that belongs to the given moment, or undefined. */
async function findMomentComment(
  client: DbClient,
  momentId: string,
  commentId: string,
): Promise<typeof momentComments.$inferSelect | undefined> {
  const [row] = await client
    .select()
    .from(momentComments)
    .where(and(eq(momentComments.id, commentId), eq(momentComments.momentId, momentId)))
  return row
}

export const momentCommentService = {
  async list(input: ListMomentCommentsInput): Promise<MomentCommentEntry[]> {
    await assertMomentExists(db, input.momentId)
    return listCommentsByMomentIds(db, [input.momentId])
  },

  async add(momentId: string, input: CreateMomentCommentInput): Promise<MomentCommentEntry> {
    return db.transaction(async (tx) => {
      await assertMomentExists(tx, momentId)
      const [row] = await tx
        .insert(momentComments)
        .values({ momentId, content: input.content })
        .returning()
      return toMomentCommentEntry(row)
    })
  },

  async update(
    input: GetMomentCommentInput,
    body: UpdateMomentCommentInput,
  ): Promise<MomentCommentEntry> {
    const row = await findMomentComment(db, input.momentId, input.commentId)
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念评论不存在', 404)

    const [updated] = await db
      .update(momentComments)
      .set({ content: body.content })
      .where(eq(momentComments.id, input.commentId))
      .returning()
    return toMomentCommentEntry(updated)
  },

  async remove(input: DeleteMomentCommentInput): Promise<{ id: string }> {
    const row = await findMomentComment(db, input.momentId, input.commentId)
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念评论不存在', 404)

    await db.delete(momentComments).where(eq(momentComments.id, input.commentId))
    return { id: input.commentId }
  },
}
