import { and, desc, eq, gte, ilike, inArray, lt, max, or, type SQL, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { fireAuditRecord } from '@/modules/audit/audit.service'
import { blobAttachments, blobs } from '@/modules/blob/blob.schema'
import { groupCommentsByMomentId } from '@/modules/moment/comment.mappers'
import { listCommentsByMomentIds } from '@/modules/moment/comment.service'
import {
  assertAllowedMomentBlob,
  MOMENT_ATTACHMENT_OWNER_TYPE,
  normalizeSortOrder,
  toLikePattern,
  toPinyinColumns,
} from '@/modules/moment/moment.domain'
import {
  groupAttachmentsByMomentId,
  type MomentAttachmentJoinRow,
  sortAttachments,
  toMomentAttachmentEntry,
  toMomentEntry,
} from '@/modules/moment/moment.mappers'
import { moments } from '@/modules/moment/moment.schema'
import type {
  AddMomentAttachmentInput,
  CreateMomentInput,
  DeleteMomentAttachmentInput,
  DeleteMomentInput,
  GetMomentInput,
  ListMomentInput,
  MomentAttachmentEntry,
  MomentEntry,
  UpdateMomentInput,
} from '@/modules/moment/moment.types'
import { MOMENT_TAG_OWNER_TYPE } from '@/modules/tag/tag.domain'
import { tagRelations } from '@/modules/tag/tag.schema'
import {
  createTagRelationsForOwner,
  listOwnerIdsByTagId,
  listTagEntriesByOwnerIds,
  tagService,
} from '@/modules/tag/tag.service'
import type { TagEntry, TagRelationEntry } from '@/modules/tag/tag.types'
import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Moment service — text moments with media attachments backed by blob refs.
// Mime/sort rules live in moment.domain.ts; row→entry mapping in
// moment.mappers.ts. Multi-write operations use db.transaction for atomicity.
// ---------------------------------------------------------------------------

type BlobRow = typeof blobs.$inferSelect

/**
 * Minimal query client — either the singleton `db` or a drizzle transaction.
 * Helpers below accept this so the same query logic works inside and outside
 * transactions without a repository abstraction.
 */
type DbClient = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

async function findBlobsByIds(client: DbClient, ids: string[]): Promise<BlobRow[]> {
  if (ids.length === 0) return []
  return client.select().from(blobs).where(inArray(blobs.id, ids))
}

async function listAttachmentsByMomentIds(
  client: DbClient,
  ids: string[],
): Promise<MomentAttachmentJoinRow[]> {
  if (ids.length === 0) return []
  return client
    .select({ attachment: blobAttachments, blob: blobs })
    .from(blobAttachments)
    .innerJoin(blobs, eq(blobAttachments.blobId, blobs.id))
    .where(
      and(
        eq(blobAttachments.ownerType, MOMENT_ATTACHMENT_OWNER_TYPE),
        inArray(blobAttachments.ownerId, ids),
      ),
    )
    .orderBy(blobAttachments.ownerId, blobAttachments.sortOrder, blobAttachments.createdAt)
}

async function findMomentAttachment(
  client: DbClient,
  momentId: string,
  attachmentId: string,
): Promise<MomentAttachmentJoinRow | undefined> {
  const [row] = await client
    .select({ attachment: blobAttachments, blob: blobs })
    .from(blobAttachments)
    .innerJoin(blobs, eq(blobAttachments.blobId, blobs.id))
    .where(
      and(
        eq(blobAttachments.id, attachmentId),
        eq(blobAttachments.ownerType, MOMENT_ATTACHMENT_OWNER_TYPE),
        eq(blobAttachments.ownerId, momentId),
      ),
    )
  return row
}

async function getNextAttachmentSortOrder(client: DbClient, momentId: string): Promise<number> {
  const [{ next }] = await client
    .select({
      next: sql<number>`coalesce(max(${blobAttachments.sortOrder}), -1) + 1`,
    })
    .from(blobAttachments)
    .where(
      and(
        eq(blobAttachments.ownerType, MOMENT_ATTACHMENT_OWNER_TYPE),
        eq(blobAttachments.ownerId, momentId),
      ),
    )
  return next
}

/** Resolve attachment blob ids to rows, validating existence and mime type. */
async function resolveAttachmentBlobs(
  client: DbClient,
  attachments: AddMomentAttachmentInput[],
): Promise<Map<string, BlobRow>> {
  const uniqueBlobIds = [...new Set(attachments.map((item) => item.blobId))]
  const rows = await findBlobsByIds(client, uniqueBlobIds)
  const byId = new Map(rows.map((row) => [row.id, row]))

  for (const id of uniqueBlobIds) {
    const row = byId.get(id)
    if (!row) {
      throw new AppError(ErrorCode.NOT_FOUND, '附件文件不存在', 404)
    }
    assertAllowedMomentBlob(row)
  }

  return byId
}

async function createMomentAttachment(
  client: DbClient,
  momentId: string,
  input: AddMomentAttachmentInput,
  blob: BlobRow,
  fallbackSortOrder: number,
): Promise<MomentAttachmentEntry> {
  const [row] = await client
    .insert(blobAttachments)
    .values({
      blobId: input.blobId,
      ownerType: MOMENT_ATTACHMENT_OWNER_TYPE,
      ownerId: momentId,
      role: input.role ?? 'attachment',
      displayName: input.displayName ?? null,
      sortOrder: normalizeSortOrder(input.sortOrder, fallbackSortOrder),
      metadata: input.metadata ?? {},
    })
    .returning()

  return toMomentAttachmentEntry({ attachment: row, blob })
}

/**
 * Keyword search condition: text / pinyin / pinyin-initial match with ILIKE.
 * The keyword is wildcard-escaped (literal % _ \) and parameterized — never
 * string-concatenated — so user input cannot inject pattern characters.
 */
function buildSearchCondition(keyword: string): SQL | undefined {
  const pattern = sql`${toLikePattern(keyword)} escape '\\'`
  return or(
    ilike(moments.text, pattern),
    ilike(moments.pinyin, pattern),
    ilike(moments.pinyinInitial, pattern),
  )
}

// ---------------------------------------------------------------------------
// Moment service — a plain singleton object with methods over `db`.
// ---------------------------------------------------------------------------

export const momentService = {
  async create(input: CreateMomentInput): Promise<MomentEntry> {
    return db.transaction(async (tx) => {
      const requestedAttachments = input.attachments ?? []
      const requestedTags = input.tags ?? []
      const blobById = await resolveAttachmentBlobs(tx, requestedAttachments)
      const pinyinCols = toPinyinColumns(input.text)
      const [row] = await tx
        .insert(moments)
        .values({
          text: input.text,
          ...pinyinCols,
          location: input.location ?? null,
        })
        .returning()

      const attachments: MomentAttachmentEntry[] = []
      for (const [index, attachment] of requestedAttachments.entries()) {
        const blob = blobById.get(attachment.blobId)
        if (!blob) {
          throw new AppError(ErrorCode.NOT_FOUND, '附件文件不存在', 404)
        }
        attachments.push(await createMomentAttachment(tx, row.id, attachment, blob, index))
      }

      // Inline tags share the transaction: missing tag → 404 rolls everything back.
      const tags = await createTagRelationsForOwner(
        tx,
        MOMENT_TAG_OWNER_TYPE,
        row.id,
        requestedTags,
      )

      return toMomentEntry(row, sortAttachments(attachments), [], 0, tags)
    })
  },

  /** 轻量聚合：闪念表条数 + 最新 updated_at（AI 动态快照指纹用，单条聚合查询）。 */
  async snapshotStats(): Promise<{ count: number; updatedAt: Date | null }> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int`, updatedAt: max(moments.updatedAt) })
      .from(moments)
    return { count: row.count, updatedAt: row.updatedAt }
  },

  async list(input: ListMomentInput): Promise<{ items: MomentEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize

    // ?tag= filter: resolve the owner set bound to the tag first, then filter.
    let tagOwnerIds: string[] | null = null
    if (input.tag !== undefined) {
      tagOwnerIds = await listOwnerIdsByTagId(db, input.tag, MOMENT_TAG_OWNER_TYPE)
      if (tagOwnerIds.length === 0) return { items: [], total: 0 }
    }

    // ?q= search: text / pinyin / pinyin-initial ILIKE match; orthogonal to tag.
    const conditions: (SQL | undefined)[] = []
    if (tagOwnerIds) conditions.push(inArray(moments.id, tagOwnerIds))
    if (input.q !== undefined) conditions.push(buildSearchCondition(input.q))
    if (input.createdFrom) conditions.push(gte(moments.createdAt, new Date(input.createdFrom)))
    if (input.createdTo) conditions.push(lt(moments.createdAt, new Date(input.createdTo)))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(moments)
        .where(where)
        .orderBy(desc(moments.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(moments).where(where),
    ])

    const momentIds = items.map((row) => row.id)
    const [attachmentRows, commentRows, tagsByMomentId] = await Promise.all([
      listAttachmentsByMomentIds(db, momentIds),
      listCommentsByMomentIds(db, momentIds),
      listTagEntriesByOwnerIds(db, MOMENT_TAG_OWNER_TYPE, momentIds),
    ])
    const attachmentsByMomentId = groupAttachmentsByMomentId(attachmentRows)
    const commentsByMomentId = groupCommentsByMomentId(commentRows)

    return {
      items: items.map((row) =>
        toMomentEntry(
          row,
          attachmentsByMomentId.get(row.id) ?? [],
          commentsByMomentId.get(row.id) ?? [],
          undefined,
          tagsByMomentId.get(row.id) ?? [],
        ),
      ),
      total: count,
    }
  },

  async get(input: GetMomentInput): Promise<MomentEntry> {
    const [row] = await db.select().from(moments).where(eq(moments.id, input.id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念不存在', 404)

    const [attachmentsByMomentId, commentsByMomentId, tagsByMomentId] = await Promise.all([
      groupAttachmentsByMomentId(await listAttachmentsByMomentIds(db, [input.id])),
      groupCommentsByMomentId(await listCommentsByMomentIds(db, [input.id])),
      listTagEntriesByOwnerIds(db, MOMENT_TAG_OWNER_TYPE, [input.id]),
    ])
    const comments = commentsByMomentId.get(input.id) ?? []
    return toMomentEntry(
      row,
      attachmentsByMomentId.get(input.id) ?? [],
      comments,
      comments.length,
      tagsByMomentId.get(input.id) ?? [],
    )
  },

  async update(input: UpdateMomentInput): Promise<MomentEntry> {
    const { id, ...data } = input
    const [row] = await db
      .update(moments)
      .set({
        ...data,
        ...toPinyinColumns(data.text),
        updatedAt: new Date(),
      })
      .where(eq(moments.id, id))
      .returning()
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念不存在', 404)
    return momentService.get({ id })
  },

  async addAttachment(
    momentId: string,
    input: AddMomentAttachmentInput,
  ): Promise<MomentAttachmentEntry> {
    return db.transaction(async (tx) => {
      const [moment] = await tx.select().from(moments).where(eq(moments.id, momentId))
      if (!moment) throw new AppError(ErrorCode.NOT_FOUND, '闪念不存在', 404)

      const blobById = await resolveAttachmentBlobs(tx, [input])
      const blob = blobById.get(input.blobId)
      if (!blob) throw new AppError(ErrorCode.NOT_FOUND, '附件文件不存在', 404)

      const fallbackSortOrder = await getNextAttachmentSortOrder(tx, momentId)
      return createMomentAttachment(tx, momentId, input, blob, fallbackSortOrder)
    })
  },

  async deleteAttachment(input: DeleteMomentAttachmentInput): Promise<{ id: string }> {
    const row = await findMomentAttachment(db, input.momentId, input.attachmentId)
    if (!row) {
      throw new AppError(ErrorCode.NOT_FOUND, '闪念附件不存在', 404)
    }

    await db.delete(blobAttachments).where(eq(blobAttachments.id, input.attachmentId))
    return { id: input.attachmentId }
  },

  async delete(input: DeleteMomentInput): Promise<{ id: string }> {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(moments).where(eq(moments.id, input.id))
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念不存在', 404)

      await tx
        .delete(blobAttachments)
        .where(
          and(
            eq(blobAttachments.ownerType, MOMENT_ATTACHMENT_OWNER_TYPE),
            eq(blobAttachments.ownerId, input.id),
          ),
        )
      // Owner relations have no FK — clean them explicitly (tags survive).
      await tx
        .delete(tagRelations)
        .where(
          and(
            eq(tagRelations.ownerType, MOMENT_TAG_OWNER_TYPE),
            eq(tagRelations.ownerId, input.id),
          ),
        )
      await tx.delete(moments).where(eq(moments.id, input.id))

      fireAuditRecord({
        event: 'moment.delete',
        message: '闪念已删除',
        level: 'warn',
        detail: { id: input.id },
      })
      return { id: input.id }
    })
  },

  // ---- Tag sub-resource (thin delegation to the tag service) -------------

  async addTag(momentId: string, tagId: string): Promise<TagRelationEntry> {
    return tagService.attach({
      tagId,
      ownerType: MOMENT_TAG_OWNER_TYPE,
      ownerId: momentId,
    })
  },

  async removeTag(momentId: string, tagId: string): Promise<{ id: string }> {
    return tagService.detach({
      tagId,
      ownerType: MOMENT_TAG_OWNER_TYPE,
      ownerId: momentId,
    })
  },

  async replaceTags(momentId: string, tagIds: string[]): Promise<TagEntry[]> {
    return tagService.replaceForOwner({
      ownerType: MOMENT_TAG_OWNER_TYPE,
      ownerId: momentId,
      tagIds,
    })
  },
}
