import { describe, expect, test } from "bun:test";

function setTestEnv() {
  process.env.DATABASE_URL ??=
    "postgresql://serenique:serenique@127.0.0.1:5432/serenique";
  process.env.BLOB_ROOT ??= "/tmp/serenique-api-moment-test";
  process.env.BLOB_MAX_SIZE ??= "104857600";
  process.env.NODE_ENV ??= "test";
}

const momentId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f1001";
const imageBlobId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f2001";
const audioBlobId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f2002";
const videoBlobId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f2003";
const svgBlobId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f2004";
const pdfBlobId = "0198f6d0-9e7c-71d7-8214-2a0f7f5f2005";

function fakeMomentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: momentId,
    text: "一条带附件的闪念",
    createdAt: new Date("2026-08-04T12:00:00.000Z"),
    updatedAt: new Date("2026-08-04T12:00:00.000Z"),
    ...overrides,
  };
}

function fakeBlobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: imageBlobId,
    originalName: "photo.png",
    storagePath: "image/2026/08/photo.png",
    mimeType: "image/png",
    size: 2048,
    checksum: "a".repeat(64),
    metadata: {},
    width: 128,
    height: 64,
    duration: null,
    createdAt: new Date("2026-08-04T12:01:00.000Z"),
    ...overrides,
  };
}

function createMemoryMomentRepository(options: {
  moments?: Array<Record<string, any>>;
  blobs?: Array<Record<string, any>>;
} = {}) {
  const momentsById = new Map<string, Record<string, any>>(
    (options.moments ?? []).map((row) => [row.id, row]),
  );
  const blobsById = new Map<string, Record<string, any>>(
    (options.blobs ?? []).map((row) => [row.id, row]),
  );
  const attachmentsById = new Map<string, Record<string, any>>();
  let attachmentIndex = 0;

  const repository: any = {
    momentsById,
    blobsById,
    attachmentsById,

    async withTransaction<T>(fn: (tx: typeof repository) => Promise<T>) {
      return fn(repository);
    },

    async createMoment(input: Record<string, unknown>) {
      const row = fakeMomentRow({
        id: input.id ?? momentId,
        ...input,
      });
      momentsById.set(String(row.id), row);
      return row;
    },

    async listMoments(input: { page: number; pageSize: number }) {
      const items = [...momentsById.values()].slice(
        (input.page - 1) * input.pageSize,
        input.page * input.pageSize,
      );
      return { items, total: momentsById.size };
    },

    async findMomentById(id: string) {
      return momentsById.get(id);
    },

    async deleteMoment(id: string) {
      const row = momentsById.get(id);
      momentsById.delete(id);
      return row;
    },

    async findBlobsByIds(ids: string[]) {
      return ids
        .map((id) => blobsById.get(id))
        .filter((row): row is Record<string, any> => Boolean(row));
    },

    async createAttachment(input: Record<string, unknown>) {
      attachmentIndex += 1;
      const id = `0198f6d0-9e7c-71d7-8214-2a0f7f5fa00${attachmentIndex}`;
      const row = {
        id,
        role: "attachment",
        displayName: null,
        sortOrder: 0,
        metadata: {},
        createdAt: new Date(`2026-08-04T12:0${attachmentIndex}:00.000Z`),
        updatedAt: new Date(`2026-08-04T12:0${attachmentIndex}:00.000Z`),
        ...input,
      };
      attachmentsById.set(id, row);
      return row;
    },

    async getNextAttachmentSortOrder(ownerId: string) {
      const sortOrders = [...attachmentsById.values()]
        .filter(
          (row) => row.ownerType === "moment" && row.ownerId === ownerId,
        )
        .map((row) => Number(row.sortOrder));
      return sortOrders.length === 0 ? 0 : Math.max(...sortOrders) + 1;
    },

    async listAttachmentsByMomentIds(ids: string[]) {
      return [...attachmentsById.values()]
        .filter(
          (attachment) =>
            attachment.ownerType === "moment" &&
            ids.includes(String(attachment.ownerId)),
        )
        .map((attachment) => ({
          attachment,
          blob: blobsById.get(String(attachment.blobId)),
        }))
        .filter((row): row is { attachment: Record<string, any>; blob: Record<string, any> } =>
          Boolean(row.blob),
        )
        .sort((a, b) => {
          const order = Number(a.attachment.sortOrder) - Number(b.attachment.sortOrder);
          if (order !== 0) return order;
          return String(a.attachment.createdAt).localeCompare(
            String(b.attachment.createdAt),
          );
        });
    },

    async findMomentAttachment(momentId: string, attachmentId: string) {
      const attachment = attachmentsById.get(attachmentId);
      if (
        !attachment ||
        attachment.ownerType !== "moment" ||
        attachment.ownerId !== momentId
      ) {
        return undefined;
      }
      const blob = blobsById.get(String(attachment.blobId));
      if (!blob) return undefined;
      return { attachment, blob };
    },

    async deleteAttachment(id: string) {
      attachmentsById.delete(id);
    },

    async deleteAttachmentsByMomentId(id: string) {
      for (const [attachmentId, attachment] of attachmentsById) {
        if (
          attachment.ownerType === "moment" &&
          attachment.ownerId === id
        ) {
          attachmentsById.delete(attachmentId);
        }
      }
    },
  };

  return repository;
}

describe("moment request schema", () => {
  test("uses text instead of content", async () => {
    setTestEnv();
    const { CreateMomentSchema } = await import("./moment.types");

    expect(CreateMomentSchema.safeParse({ text: "hello" }).success).toBe(true);
    expect(CreateMomentSchema.safeParse({ content: "hello" }).success).toBe(
      false,
    );
  });
});

describe("moment attachments", () => {
  test("creates text moments with ordered media attachments", async () => {
    setTestEnv();
    const { createMomentService } = await import("./moment.service");
    const repository = createMemoryMomentRepository({
      blobs: [
        fakeBlobRow({ id: imageBlobId, mimeType: "image/png" }),
        fakeBlobRow({
          id: audioBlobId,
          originalName: "voice.mp3",
          mimeType: "audio/mpeg",
          width: null,
          height: null,
          duration: 5.2,
        }),
        fakeBlobRow({
          id: videoBlobId,
          originalName: "clip.mp4",
          mimeType: "video/mp4",
          width: 1920,
          height: 1080,
          duration: 12.6,
        }),
      ],
    });
    const service = createMomentService({ repository });

    const result = await service.create({
      text: "一条带附件的闪念",
      attachments: [
        { blobId: imageBlobId, sortOrder: 0, displayName: "cover.png" },
        { blobId: audioBlobId, metadata: { caption: "voice" } },
        { blobId: videoBlobId, sortOrder: 5 },
      ],
    });

    expect(result.text).toBe("一条带附件的闪念");
    expect("content" in result).toBe(false);
    expect(result.attachments.map((item) => item.blobId)).toEqual([
      imageBlobId,
      audioBlobId,
      videoBlobId,
    ]);
    expect(result.attachments.map((item) => item.sortOrder)).toEqual([0, 1, 5]);
    expect(result.attachments[0].displayName).toBe("cover.png");
    expect(result.attachments[0].blob).toMatchObject({
      id: imageBlobId,
      mimeType: "image/png",
      fileUrl: `/api/blobs/${imageBlobId}/file`,
    });

    expect([...repository.attachmentsById.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blobId: imageBlobId,
          ownerType: "moment",
          ownerId: result.id,
        }),
        expect.objectContaining({
          blobId: audioBlobId,
          ownerType: "moment",
          ownerId: result.id,
        }),
      ]),
    );
  });

  test("rejects non media files and svg images", async () => {
    setTestEnv();
    const { createMomentService } = await import("./moment.service");
    const repository = createMemoryMomentRepository({
      blobs: [
        fakeBlobRow({ id: svgBlobId, mimeType: "image/svg+xml" }),
        fakeBlobRow({ id: pdfBlobId, mimeType: "application/pdf" }),
      ],
    });
    const service = createMomentService({ repository });

    await expect(
      service.create({ text: "svg", attachments: [{ blobId: svgBlobId }] }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
    await expect(
      service.create({ text: "pdf", attachments: [{ blobId: pdfBlobId }] }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });

    expect(repository.momentsById.size).toBe(0);
    expect(repository.attachmentsById.size).toBe(0);
  });

  test("lists moments with attachments by default", async () => {
    setTestEnv();
    const { createMomentService } = await import("./moment.service");
    const repository = createMemoryMomentRepository({
      moments: [fakeMomentRow()],
      blobs: [fakeBlobRow({ id: imageBlobId, mimeType: "image/jpeg" })],
    });
    await repository.createAttachment({
      blobId: imageBlobId,
      ownerType: "moment",
      ownerId: momentId,
      sortOrder: 3,
      metadata: { alt: "photo" },
    });
    await repository.createAttachment({
      blobId: imageBlobId,
      ownerType: "diary",
      ownerId: momentId,
      sortOrder: 0,
    });
    const service = createMomentService({ repository });

    const result = await service.list({ page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: momentId,
      text: "一条带附件的闪念",
    });
    expect(result.items[0].attachments).toHaveLength(1);
    expect(result.items[0].attachments[0]).toMatchObject({
      blobId: imageBlobId,
      sortOrder: 3,
      metadata: { alt: "photo" },
    });
  });

  test("deletes moment attachment references without deleting blobs", async () => {
    setTestEnv();
    const { createMomentService } = await import("./moment.service");
    const repository = createMemoryMomentRepository({
      moments: [fakeMomentRow()],
      blobs: [fakeBlobRow({ id: imageBlobId })],
    });
    const attachment = await repository.createAttachment({
      blobId: imageBlobId,
      ownerType: "moment",
      ownerId: momentId,
    });
    const service = createMomentService({ repository });

    await service.delete({ id: momentId });

    expect(repository.momentsById.has(momentId)).toBe(false);
    expect(repository.attachmentsById.has(attachment.id)).toBe(false);
    expect(repository.blobsById.has(imageBlobId)).toBe(true);
  });
});
