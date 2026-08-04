import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { blobAttachments, blobs } from "@/modules/blob/blob.schema";
import { moments } from "@/modules/moment/moment.schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type {
  AddMomentAttachmentInput,
  CreateMomentInput,
  DeleteMomentAttachmentInput,
  DeleteMomentInput,
  GetMomentInput,
  ListMomentInput,
  MomentAttachmentEntry,
  MomentBlobEntry,
  MomentEntry,
} from "@/modules/moment/moment.types";

// ---------------------------------------------------------------------------
// Moment service — text moments with media attachments backed by blob refs.
// ---------------------------------------------------------------------------

export const MOMENT_ATTACHMENT_OWNER_TYPE = "moment";

type MomentRow = typeof moments.$inferSelect;
type NewMomentRow = typeof moments.$inferInsert;
type BlobRow = typeof blobs.$inferSelect;
type BlobAttachmentRow = typeof blobAttachments.$inferSelect;
type NewBlobAttachmentRow = typeof blobAttachments.$inferInsert;

type MomentAttachmentJoinRow = {
  attachment: BlobAttachmentRow;
  blob: BlobRow;
};

export type MomentRepository = {
  withTransaction<T>(fn: (repository: MomentRepository) => Promise<T>): Promise<T>;
  createMoment(input: NewMomentRow): Promise<MomentRow>;
  listMoments(input: ListMomentInput): Promise<{
    items: MomentRow[];
    total: number;
  }>;
  findMomentById(id: string): Promise<MomentRow | undefined>;
  deleteMoment(id: string): Promise<MomentRow | undefined>;
  findBlobsByIds(ids: string[]): Promise<BlobRow[]>;
  createAttachment(input: NewBlobAttachmentRow): Promise<BlobAttachmentRow>;
  getNextAttachmentSortOrder(momentId: string): Promise<number>;
  listAttachmentsByMomentIds(ids: string[]): Promise<MomentAttachmentJoinRow[]>;
  findMomentAttachment(
    momentId: string,
    attachmentId: string,
  ): Promise<MomentAttachmentJoinRow | undefined>;
  deleteAttachment(id: string): Promise<void>;
  deleteAttachmentsByMomentId(id: string): Promise<void>;
};

export type CreateMomentServiceDeps = {
  repository: MomentRepository;
};

function createDrizzleMomentRepository(client: any): MomentRepository {
  const repository: MomentRepository = {
    async withTransaction<T>(fn: (tx: MomentRepository) => Promise<T>) {
      return client.transaction((tx: any) =>
        fn(createDrizzleMomentRepository(tx)),
      );
    },

    async createMoment(input: NewMomentRow) {
      const [row] = await client.insert(moments).values(input).returning();
      return row;
    },

    async listMoments(input: ListMomentInput) {
      const offset = (input.page - 1) * input.pageSize;
      const [items, [{ count }]] = await Promise.all([
        client
          .select()
          .from(moments)
          .orderBy(moments.createdAt)
          .limit(input.pageSize)
          .offset(offset),
        client.select({ count: sql<number>`count(*)::int` }).from(moments),
      ]);
      return { items, total: count };
    },

    async findMomentById(id: string) {
      const [row] = await client
        .select()
        .from(moments)
        .where(eq(moments.id, id));
      return row;
    },

    async deleteMoment(id: string) {
      const [row] = await client
        .delete(moments)
        .where(eq(moments.id, id))
        .returning();
      return row;
    },

    async findBlobsByIds(ids: string[]) {
      if (ids.length === 0) return [];
      return client.select().from(blobs).where(inArray(blobs.id, ids));
    },

    async createAttachment(input: NewBlobAttachmentRow) {
      const [row] = await client
        .insert(blobAttachments)
        .values(input)
        .returning();
      return row;
    },

    async getNextAttachmentSortOrder(momentId: string) {
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
    },

    async listAttachmentsByMomentIds(ids: string[]) {
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
    },

    async findMomentAttachment(momentId: string, attachmentId: string) {
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
    },

    async deleteAttachment(id: string) {
      await client.delete(blobAttachments).where(eq(blobAttachments.id, id));
    },

    async deleteAttachmentsByMomentId(id: string) {
      await client
        .delete(blobAttachments)
        .where(
          and(
            eq(blobAttachments.ownerType, MOMENT_ATTACHMENT_OWNER_TYPE),
            eq(blobAttachments.ownerId, id),
          ),
        );
    },
  };

  return repository;
}

function normalizedMimeType(mimeType: string): string {
  return mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
}

function isAllowedMomentMimeType(mimeType: string): boolean {
  const normalized = normalizedMimeType(mimeType);
  if (normalized === "image/svg+xml") return false;
  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/")
  );
}

function assertAllowedMomentBlob(blob: BlobRow) {
  if (!isAllowedMomentMimeType(blob.mimeType)) {
    throw new AppError(
      ErrorCode.VALIDATION,
      "闪念附件仅支持图片、音频和视频，且不支持 SVG",
      400,
    );
  }
}

async function resolveAttachmentBlobs(
  repository: MomentRepository,
  attachments: AddMomentAttachmentInput[],
): Promise<Map<string, BlobRow>> {
  const uniqueBlobIds = [...new Set(attachments.map((item) => item.blobId))];
  const rows = await repository.findBlobsByIds(uniqueBlobIds);
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

function toMomentBlobEntry(row: BlobRow): MomentBlobEntry {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    metadata: row.metadata as Record<string, unknown>,
    width: row.width,
    height: row.height,
    duration: row.duration,
    createdAt: row.createdAt.toISOString(),
    fileUrl: `/api/blobs/${row.id}/file`,
  };
}

function toMomentAttachmentEntry({
  attachment,
  blob,
}: MomentAttachmentJoinRow): MomentAttachmentEntry {
  return {
    id: attachment.id,
    blobId: attachment.blobId,
    role: attachment.role,
    displayName: attachment.displayName,
    sortOrder: attachment.sortOrder,
    metadata: attachment.metadata as Record<string, unknown>,
    createdAt: attachment.createdAt.toISOString(),
    updatedAt: attachment.updatedAt.toISOString(),
    blob: toMomentBlobEntry(blob),
  };
}

function sortAttachments(
  attachments: MomentAttachmentEntry[],
): MomentAttachmentEntry[] {
  return [...attachments].sort((a, b) => {
    const order = a.sortOrder - b.sortOrder;
    if (order !== 0) return order;
    const created = a.createdAt.localeCompare(b.createdAt);
    if (created !== 0) return created;
    return a.id.localeCompare(b.id);
  });
}

function groupAttachmentsByMomentId(
  rows: MomentAttachmentJoinRow[],
): Map<string, MomentAttachmentEntry[]> {
  const grouped = new Map<string, MomentAttachmentEntry[]>();

  for (const row of rows) {
    const ownerId = row.attachment.ownerId;
    const group = grouped.get(ownerId) ?? [];
    group.push(toMomentAttachmentEntry(row));
    grouped.set(ownerId, group);
  }

  for (const [ownerId, attachments] of grouped) {
    grouped.set(ownerId, sortAttachments(attachments));
  }

  return grouped;
}

function toEntry(
  row: MomentRow,
  attachments: MomentAttachmentEntry[] = [],
): MomentEntry {
  return {
    id: row.id,
    text: row.text,
    attachments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const sortOrder = Number(value);
  if (!Number.isInteger(sortOrder)) {
    throw new AppError(ErrorCode.VALIDATION, "附件排序值必须是整数", 400);
  }
  return sortOrder;
}

async function createMomentAttachment(
  repository: MomentRepository,
  momentId: string,
  input: AddMomentAttachmentInput,
  blob: BlobRow,
  fallbackSortOrder: number,
): Promise<MomentAttachmentEntry> {
  const attachment = await repository.createAttachment({
    blobId: input.blobId,
    ownerType: MOMENT_ATTACHMENT_OWNER_TYPE,
    ownerId: momentId,
    role: input.role ?? "attachment",
    displayName: input.displayName ?? null,
    sortOrder: normalizeSortOrder(input.sortOrder, fallbackSortOrder),
    metadata: input.metadata ?? {},
  });

  return toMomentAttachmentEntry({ attachment, blob });
}

export function createMomentService({ repository }: CreateMomentServiceDeps) {
  return {
    async create(input: CreateMomentInput): Promise<MomentEntry> {
      return repository.withTransaction(async (tx) => {
        const requestedAttachments = input.attachments ?? [];
        const blobById = await resolveAttachmentBlobs(tx, requestedAttachments);
        const row = await tx.createMoment({ text: input.text });
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

        return toEntry(row, sortAttachments(attachments));
      });
    },

    async list(
      input: ListMomentInput,
    ): Promise<{ items: MomentEntry[]; total: number }> {
      const { items, total } = await repository.listMoments(input);
      const attachmentRows = await repository.listAttachmentsByMomentIds(
        items.map((row) => row.id),
      );
      const attachmentsByMomentId =
        groupAttachmentsByMomentId(attachmentRows);

      return {
        items: items.map((row) =>
          toEntry(row, attachmentsByMomentId.get(row.id) ?? []),
        ),
        total,
      };
    },

    async get(input: GetMomentInput): Promise<MomentEntry> {
      const row = await repository.findMomentById(input.id);
      if (!row) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);

      const attachmentsByMomentId = groupAttachmentsByMomentId(
        await repository.listAttachmentsByMomentIds([input.id]),
      );
      return toEntry(row, attachmentsByMomentId.get(input.id) ?? []);
    },

    async addAttachment(
      momentId: string,
      input: AddMomentAttachmentInput,
    ): Promise<MomentAttachmentEntry> {
      return repository.withTransaction(async (tx) => {
        const moment = await tx.findMomentById(momentId);
        if (!moment) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);

        const blobById = await resolveAttachmentBlobs(tx, [input]);
        const blob = blobById.get(input.blobId);
        if (!blob) throw new AppError(ErrorCode.NOT_FOUND, "附件文件不存在", 404);

        const fallbackSortOrder = await tx.getNextAttachmentSortOrder(momentId);
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
      const row = await repository.findMomentAttachment(
        input.momentId,
        input.attachmentId,
      );
      if (!row) {
        throw new AppError(ErrorCode.NOT_FOUND, "闪念附件不存在", 404);
      }

      await repository.deleteAttachment(input.attachmentId);
      return { id: input.attachmentId };
    },

    async delete(input: DeleteMomentInput): Promise<{ id: string }> {
      return repository.withTransaction(async (tx) => {
        const row = await tx.findMomentById(input.id);
        if (!row) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);

        await tx.deleteAttachmentsByMomentId(input.id);
        await tx.deleteMoment(input.id);
        return { id: input.id };
      });
    },
  };
}

export const momentService = createMomentService({
  repository: createDrizzleMomentRepository(db),
});
