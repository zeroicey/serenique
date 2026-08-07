import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { blobAttachments, blobs } from "@/modules/blob/blob.schema";
import { moments } from "@/modules/moment/moment.schema";
import { listCommentsByMomentIds } from "@/modules/moment/comment.service";
import { groupCommentsByMomentId } from "@/modules/moment/comment.mappers";
import {
  assertAllowedMomentBlob,
  MOMENT_ATTACHMENT_OWNER_TYPE,
  normalizeSortOrder,
} from "@/modules/moment/moment.domain";
import {
  groupAttachmentsByMomentId,
  sortAttachments,
  toMomentAttachmentEntry,
  toMomentEntry,
  type MomentAttachmentJoinRow,
} from "@/modules/moment/moment.mappers";
import { AppError, ErrorCode } from "@/shared/errors";
import type {
  AddMomentAttachmentInput,
  CreateMomentInput,
  DeleteMomentAttachmentInput,
  DeleteMomentInput,
  GetMomentInput,
  ListMomentInput,
  MomentAttachmentEntry,
  MomentEntry,
} from "@/modules/moment/moment.types";

// ---------------------------------------------------------------------------
// Moment service — text moments with media attachments backed by blob refs.
// Mime/sort rules live in moment.domain.ts; row→entry mapping in
// moment.mappers.ts. Multi-write operations use db.transaction for atomicity.
// ---------------------------------------------------------------------------

type BlobRow = typeof blobs.$inferSelect;

/**
 * Minimal query client — either the singleton `db` or a drizzle transaction.
 * Helpers below accept this so the same query logic works inside and outside
 * transactions without a repository abstraction.
 */
type DbClient = Pick<typeof db, "select" | "insert" | "update" | "delete">;

async function findBlobsByIds(
  client: DbClient,
  ids: string[],
): Promise<BlobRow[]> {
  if (ids.length === 0) return [];
  return client.select().from(blobs).where(inArray(blobs.id, ids));
}

async function listAttachmentsByMomentIds(
  client: DbClient,
  ids: string[],
): Promise<MomentAttachmentJoinRow[]> {
  if (ids.length === 0) return [];
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
    .orderBy(
      blobAttachments.ownerId,
      blobAttachments.sortOrder,
      blobAttachments.createdAt,
    );
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
    );
  return row;
}

async function getNextAttachmentSortOrder(
  client: DbClient,
  momentId: string,
): Promise<number> {
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
    );
  return next;
}

/** Resolve attachment blob ids to rows, validating existence and mime type. */
async function resolveAttachmentBlobs(
  client: DbClient,
  attachments: AddMomentAttachmentInput[],
): Promise<Map<string, BlobRow>> {
  const uniqueBlobIds = [...new Set(attachments.map((item) => item.blobId))];
  const rows = await findBlobsByIds(client, uniqueBlobIds);
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const id of uniqueBlobIds) {
    const row = byId.get(id);
    if (!row) {
      throw new AppError(ErrorCode.NOT_FOUND, "附件文件不存在", 404);
    }
    assertAllowedMomentBlob(row);
  }

  return byId;
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
      role: input.role ?? "attachment",
      displayName: input.displayName ?? null,
      sortOrder: normalizeSortOrder(input.sortOrder, fallbackSortOrder),
      metadata: input.metadata ?? {},
    })
    .returning();

  return toMomentAttachmentEntry({ attachment: row, blob });
}

// ---------------------------------------------------------------------------
// Moment service — a plain singleton object with methods over `db`.
// ---------------------------------------------------------------------------

export const momentService = {
  async create(input: CreateMomentInput): Promise<MomentEntry> {
    return db.transaction(async (tx) => {
      const requestedAttachments = input.attachments ?? [];
      const blobById = await resolveAttachmentBlobs(tx, requestedAttachments);
      const [row] = await tx
        .insert(moments)
        .values({ text: input.text })
        .returning();

      const attachments: MomentAttachmentEntry[] = [];
      for (const [index, attachment] of requestedAttachments.entries()) {
        const blob = blobById.get(attachment.blobId);
        if (!blob) {
          throw new AppError(ErrorCode.NOT_FOUND, "附件文件不存在", 404);
        }
        attachments.push(
          await createMomentAttachment(tx, row.id, attachment, blob, index),
        );
      }

      return toMomentEntry(row, sortAttachments(attachments), [], 0);
    });
  },

  async list(
    input: ListMomentInput,
  ): Promise<{ items: MomentEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(moments)
        .orderBy(desc(moments.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(moments),
    ]);

    const momentIds = items.map((row) => row.id);
    const [attachmentRows, commentRows] = await Promise.all([
      listAttachmentsByMomentIds(db, momentIds),
      listCommentsByMomentIds(db, momentIds),
    ]);
    const attachmentsByMomentId = groupAttachmentsByMomentId(attachmentRows);
    const commentsByMomentId = groupCommentsByMomentId(commentRows);

    return {
      items: items.map((row) =>
        toMomentEntry(
          row,
          attachmentsByMomentId.get(row.id) ?? [],
          commentsByMomentId.get(row.id) ?? [],
        ),
      ),
      total: count,
    };
  },

  async get(input: GetMomentInput): Promise<MomentEntry> {
    const [row] = await db.select().from(moments).where(eq(moments.id, input.id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);

    const [attachmentsByMomentId, commentsByMomentId] = await Promise.all([
      groupAttachmentsByMomentId(
        await listAttachmentsByMomentIds(db, [input.id]),
      ),
      groupCommentsByMomentId(await listCommentsByMomentIds(db, [input.id])),
    ]);
    const comments = commentsByMomentId.get(input.id) ?? [];
    return toMomentEntry(
      row,
      attachmentsByMomentId.get(input.id) ?? [],
      comments,
      comments.length,
    );
  },

  async addAttachment(
    momentId: string,
    input: AddMomentAttachmentInput,
  ): Promise<MomentAttachmentEntry> {
    return db.transaction(async (tx) => {
      const [moment] = await tx
        .select()
        .from(moments)
        .where(eq(moments.id, momentId));
      if (!moment) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);

      const blobById = await resolveAttachmentBlobs(tx, [input]);
      const blob = blobById.get(input.blobId);
      if (!blob) throw new AppError(ErrorCode.NOT_FOUND, "附件文件不存在", 404);

      const fallbackSortOrder = await getNextAttachmentSortOrder(tx, momentId);
      return createMomentAttachment(
        tx,
        momentId,
        input,
        blob,
        fallbackSortOrder,
      );
    });
  },

  async deleteAttachment(
    input: DeleteMomentAttachmentInput,
  ): Promise<{ id: string }> {
    const row = await findMomentAttachment(
      db,
      input.momentId,
      input.attachmentId,
    );
    if (!row) {
      throw new AppError(ErrorCode.NOT_FOUND, "闪念附件不存在", 404);
    }

    await db.delete(blobAttachments).where(eq(blobAttachments.id, input.attachmentId));
    return { id: input.attachmentId };
  },

  async delete(input: DeleteMomentInput): Promise<{ id: string }> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(moments)
        .where(eq(moments.id, input.id));
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);

      await tx
        .delete(blobAttachments)
        .where(
          and(
            eq(blobAttachments.ownerType, MOMENT_ATTACHMENT_OWNER_TYPE),
            eq(blobAttachments.ownerId, input.id),
          ),
        );
      await tx.delete(moments).where(eq(moments.id, input.id));
      return { id: input.id };
    });
  },
};
