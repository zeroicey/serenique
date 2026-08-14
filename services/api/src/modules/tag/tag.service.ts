import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { fireAuditRecord } from '@/modules/audit/audit.service'
import { moments } from '@/modules/moment/moment.schema'
import {
  getOwnerValidator,
  isForeignKeyViolation,
  isUniqueViolation,
  MOMENT_TAG_OWNER_TYPE,
  normalizeTagName,
  registerOwnerValidator,
  TAG_RELATIONS_UNIQUE,
  TAGS_NAME_UNIQUE,
  uniqueTagIds,
} from '@/modules/tag/tag.domain'
import {
  groupTagEntriesByOwnerId,
  type TagJoinRow,
  toTagEntry,
  toTagRelationEntry,
} from '@/modules/tag/tag.mappers'
import { tagRelations, tags } from '@/modules/tag/tag.schema'
import type {
  AttachTagInput,
  CreateTagInput,
  DeleteTagInput,
  DetachTagInput,
  GetTagInput,
  ListTagInput,
  RenameTagInput,
  ReplaceTagsInput,
  TagEntry,
  TagRelationEntry,
} from '@/modules/tag/tag.types'
import { AppError, ErrorCode } from '@/shared/errors'

// ---------------------------------------------------------------------------
// Tag service — tags as independent resources + polymorphic owner relations.
// Pure rules (name normalization, ownerType registry, dedup, error guards)
// live in tag.domain.ts; row→entry mapping in tag.mappers.ts. Multi-write
// operations use db.transaction for atomicity.
//
// Cross-module helpers (listTagEntriesByOwnerIds / createTagRelationsForOwner
// / listOwnerIdsByTagId) are exported for the moment module, which embeds
// tags[] and filters by tag — same pattern as comment.service's
// listCommentsByMomentIds.
// ---------------------------------------------------------------------------

/** Minimal query client — either the singleton `db` or a drizzle transaction. */
type DbClient = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

// Register the moment owner existence validator (module load). The registry
// itself lives in tag.domain.ts (pure); only the real query is here.
registerOwnerValidator(MOMENT_TAG_OWNER_TYPE, async (client, ownerId) => {
  const [row] = await (client as DbClient)
    .select({ id: moments.id })
    .from(moments)
    .where(eq(moments.id, ownerId))
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, '闪念不存在', 404)
})

/** Throw NOT_FOUND unless a tag with the given id exists. */
async function assertTagExists(client: DbClient, tagId: string): Promise<void> {
  const [row] = await client.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId))
  if (!row) throw new AppError(ErrorCode.NOT_FOUND, '标签不存在', 404)
}

/** Resolve tag rows for the ids, throwing 404 when any id is missing. */
async function resolveTagsByIds(
  client: DbClient,
  ids: string[],
): Promise<(typeof tags.$inferSelect)[]> {
  if (ids.length === 0) return []
  const rows = await client.select().from(tags).where(inArray(tags.id, ids))
  if (rows.length !== ids.length) {
    throw new AppError(ErrorCode.NOT_FOUND, '标签不存在', 404)
  }
  return rows
}

/** Validate ownerType via the registry (400) and the owner row (404). */
async function assertOwnerExists(
  client: DbClient,
  ownerType: string,
  ownerId: string,
): Promise<void> {
  const validator = getOwnerValidator(ownerType)
  await validator(client, ownerId)
}

// ---------------------------------------------------------------------------
// Cross-module helpers (minimal client type — usable with db or a transaction)
// ---------------------------------------------------------------------------

/**
 * Batch-load tag join rows for many owner ids, ordered by relation creation.
 * Shared by the moment module's list/get embedding.
 */
export async function listTagJoinsByOwnerIds(
  client: DbClient,
  ownerType: string,
  ownerIds: string[],
): Promise<TagJoinRow[]> {
  if (ownerIds.length === 0) return []
  return client
    .select({ relation: tagRelations, tag: tags })
    .from(tagRelations)
    .innerJoin(tags, eq(tagRelations.tagId, tags.id))
    .where(and(eq(tagRelations.ownerType, ownerType), inArray(tagRelations.ownerId, ownerIds)))
    .orderBy(tagRelations.createdAt, tagRelations.id)
}

/** Count relations per tag id for the given owner type (tagId → count). */
async function countRelationsByTagIds(
  client: DbClient,
  tagIds: string[],
  ownerType: string,
): Promise<Map<string, number>> {
  if (tagIds.length === 0) return new Map()
  const rows = await client
    .select({
      tagId: tagRelations.tagId,
      count: sql<number>`count(*)::int`,
    })
    .from(tagRelations)
    .where(and(inArray(tagRelations.tagId, tagIds), eq(tagRelations.ownerType, ownerType)))
    .groupBy(tagRelations.tagId)
  return new Map(rows.map((row) => [row.tagId, row.count]))
}

/**
 * Batch-load tags grouped by owner id (with per-tag moment counts). Used by
 * the moment module so list/detail embed tags[] in one query, not N+1.
 */
export async function listTagEntriesByOwnerIds(
  client: DbClient,
  ownerType: string,
  ownerIds: string[],
): Promise<Map<string, TagEntry[]>> {
  if (ownerIds.length === 0) return new Map()
  const rows = await listTagJoinsByOwnerIds(client, ownerType, ownerIds)
  const tagIds = [...new Set(rows.map((row) => row.relation.tagId))]
  const counts = await countRelationsByTagIds(client, tagIds, ownerType)
  return groupTagEntriesByOwnerId(rows, counts)
}

/**
 * Owner ids bound to a tag (for list filtering), or empty when the tag is
 * unknown / not yet bound. Callers treat an empty result as "no matches".
 */
export async function listOwnerIdsByTagId(
  client: DbClient,
  tagId: string,
  ownerType: string,
): Promise<string[]> {
  const rows = await client
    .select({ ownerId: tagRelations.ownerId })
    .from(tagRelations)
    .where(and(eq(tagRelations.tagId, tagId), eq(tagRelations.ownerType, ownerType)))
  return rows.map((row) => row.ownerId)
}

/**
 * Bind tags to a fresh owner inside a transaction (moment create inline tags).
 * Deduplicates the input, throws 404 for missing tags, and tolerates
 * already-bound relations (set semantics — no 409). Returns the bound tags in
 * request order with real moment counts.
 */
export async function createTagRelationsForOwner(
  client: DbClient,
  ownerType: string,
  ownerId: string,
  tagIds: string[],
): Promise<TagEntry[]> {
  const ids = uniqueTagIds(tagIds)
  if (ids.length === 0) return []

  const rows = await resolveTagsByIds(client, ids)
  const byId = new Map(rows.map((row) => [row.id, row]))

  await client
    .insert(tagRelations)
    .values(ids.map((tagId) => ({ tagId, ownerType, ownerId })))
    .onConflictDoNothing()

  const counts = await countRelationsByTagIds(client, ids, ownerType)
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is typeof tags.$inferSelect => row !== undefined)
    .map((row) => toTagEntry(row, counts.get(row.id) ?? 0))
}

// ---------------------------------------------------------------------------
// Tag service — a plain singleton object with methods over `db`.
// ---------------------------------------------------------------------------

export const tagService = {
  async create(input: CreateTagInput): Promise<TagEntry> {
    const name = normalizeTagName(input.name)
    try {
      const [row] = await db.insert(tags).values({ name }).returning()
      return toTagEntry(row)
    } catch (err) {
      // Concurrent create of the same name hits the DB unique constraint.
      if (isUniqueViolation(err, TAGS_NAME_UNIQUE)) {
        throw new AppError(ErrorCode.CONFLICT, '同名标签已存在', 409)
      }
      throw err
    }
  },

  async list(input: ListTagInput): Promise<{ items: TagEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize
    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          tag: tags,
          momentCount: sql<number>`count(${tagRelations.id})::int`,
        })
        .from(tags)
        .leftJoin(
          tagRelations,
          and(eq(tagRelations.tagId, tags.id), eq(tagRelations.ownerType, MOMENT_TAG_OWNER_TYPE)),
        )
        .groupBy(tags.id)
        .orderBy(desc(tags.updatedAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(tags),
    ])
    return {
      items: items.map((row) => toTagEntry(row.tag, row.momentCount)),
      total: count,
    }
  },

  async get(input: GetTagInput): Promise<TagEntry> {
    const [row] = await db.select().from(tags).where(eq(tags.id, input.id))
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '标签不存在', 404)
    const momentCounts = await countRelationsByTagIds(db, [row.id], MOMENT_TAG_OWNER_TYPE)
    return toTagEntry(row, momentCounts.get(row.id) ?? 0)
  },

  async rename(input: RenameTagInput): Promise<TagEntry> {
    const name = normalizeTagName(input.name)
    try {
      const [row] = await db
        .update(tags)
        .set({ name, updatedAt: new Date() })
        .where(eq(tags.id, input.id))
        .returning()
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, '标签不存在', 404)
      return toTagEntry(row)
    } catch (err) {
      // Concurrent rename to an existing name hits the DB unique constraint.
      if (isUniqueViolation(err, TAGS_NAME_UNIQUE)) {
        throw new AppError(ErrorCode.CONFLICT, '同名标签已存在', 409)
      }
      throw err
    }
  },

  async delete(input: DeleteTagInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(tags)
      .where(eq(tags.id, input.id))
      .returning({ id: tags.id, name: tags.name })
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '标签不存在', 404)
    // Relations cascade at the DB level (ON DELETE CASCADE).
    fireAuditRecord({
      event: 'tag.delete',
      message: '标签已删除（级联移除关联）',
      level: 'warn',
      detail: { id: row.id, name: row.name },
    })
    return { id: row.id }
  },

  async attach(input: AttachTagInput): Promise<TagRelationEntry> {
    return db.transaction(async (tx) => {
      await assertTagExists(tx, input.tagId)
      await assertOwnerExists(tx, input.ownerType, input.ownerId)
      try {
        const [row] = await tx
          .insert(tagRelations)
          .values({
            tagId: input.tagId,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
          })
          .returning()
        return toTagRelationEntry(row)
      } catch (err) {
        // Same (tag, owner) bound twice → unique constraint → 409.
        if (isUniqueViolation(err, TAG_RELATIONS_UNIQUE)) {
          throw new AppError(ErrorCode.CONFLICT, '该标签已绑定此内容', 409)
        }
        // Tag deleted between the existence check and the insert → FK 23503.
        if (isForeignKeyViolation(err)) {
          throw new AppError(ErrorCode.NOT_FOUND, '标签不存在', 404)
        }
        throw err
      }
    })
  },

  async detach(input: DetachTagInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(tagRelations)
      .where(
        and(
          eq(tagRelations.tagId, input.tagId),
          eq(tagRelations.ownerType, input.ownerType),
          eq(tagRelations.ownerId, input.ownerId),
        ),
      )
      .returning({ id: tagRelations.id })
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, '标签绑定关系不存在', 404)
    return { id: row.id }
  },

  /**
   * Idempotent set replace for one owner. Tolerates already-bound tags (no
   * 409 — the result is identical), 404 on missing tag ids, dedupes the input,
   * and rolls back the whole transaction on any failure. Empty array clears
   * all relations. Returns the new tags[] in request order.
   */
  async replaceForOwner(input: ReplaceTagsInput): Promise<TagEntry[]> {
    const tagIds = uniqueTagIds(input.tagIds)
    return db.transaction(async (tx) => {
      await assertOwnerExists(tx, input.ownerType, input.ownerId)

      // Validate every requested tag inside the tx → any failure rolls back.
      const requested = tagIds.length > 0 ? await resolveTagsByIds(tx, tagIds) : []
      const requestedById = new Map(requested.map((row) => [row.id, row]))

      const existingRows = await tx
        .select()
        .from(tagRelations)
        .where(
          and(eq(tagRelations.ownerType, input.ownerType), eq(tagRelations.ownerId, input.ownerId)),
        )
      const existingIds = new Set(existingRows.map((row) => row.tagId))

      const toInsert = tagIds.filter((id) => !existingIds.has(id))
      const toDelete = existingRows.filter((row) => !requestedById.has(row.tagId))

      if (toDelete.length > 0) {
        await tx.delete(tagRelations).where(
          and(
            eq(tagRelations.ownerType, input.ownerType),
            eq(tagRelations.ownerId, input.ownerId),
            inArray(
              tagRelations.tagId,
              toDelete.map((row) => row.tagId),
            ),
          ),
        )
      }
      if (toInsert.length > 0) {
        await tx
          .insert(tagRelations)
          .values(
            toInsert.map((tagId) => ({
              tagId,
              ownerType: input.ownerType,
              ownerId: input.ownerId,
            })),
          )
          .onConflictDoNothing()
      }

      // Count AFTER the inserts so newly bound tags report real moment counts.
      const counts =
        tagIds.length > 0
          ? await countRelationsByTagIds(tx, tagIds, MOMENT_TAG_OWNER_TYPE)
          : new Map<string, number>()
      return tagIds
        .map((id) => requestedById.get(id))
        .filter((row): row is typeof tags.$inferSelect => row !== undefined)
        .map((row) => toTagEntry(row, counts.get(row.id) ?? 0))
    })
  },
}
