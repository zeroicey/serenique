import { describe, expect, test } from "bun:test";

function setTestEnv() {
  process.env.DATABASE_URL ??=
    "postgresql://serenique:serenique@127.0.0.1:5432/serenique";
  process.env.BLOB_ROOT ??= "/tmp/serenique-api-blob-test";
  process.env.BLOB_MAX_SIZE ??= "104857600";
  process.env.NODE_ENV ??= "test";
}

function fakeBlobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
    originalName: "daily-note.png",
    storagePath: "image/2026/08/0198f6bd-4f06-7289-b57d-62e8af51a4aa.png",
    mimeType: "image/png",
    size: 2048,
    checksum: "a".repeat(64),
    metadata: {},
    width: 128,
    height: 64,
    duration: null,
    createdAt: new Date("2026-08-04T12:00:00.000Z"),
    ...overrides,
  };
}

function createMemoryBlobRepository(
  initialRows: Array<Record<string, any>> = [fakeBlobRow()],
) {
  const blobsById = new Map<string, Record<string, any>>(
    initialRows.map((row) => [row.id, row]),
  );
  const attachmentsById = new Map<string, Record<string, any>>();

  return {
    blobsById,
    attachmentsById,

    async findBlobByChecksum(checksum: string) {
      return [...blobsById.values()].find((row) => row.checksum === checksum);
    },

    async insertBlob(input: Record<string, unknown>) {
      const row: Record<string, any> = {
        metadata: {},
        width: null,
        height: null,
        duration: null,
        createdAt: new Date("2026-08-04T12:00:00.000Z"),
        ...input,
      };
      blobsById.set(String(row.id), row);
      return row;
    },

    async listBlobs() {
      return { items: [...blobsById.values()], total: blobsById.size };
    },

    async findBlobById(id: string) {
      return blobsById.get(id);
    },

    async deleteBlob(id: string) {
      blobsById.delete(id);
    },

    async createAttachment(input: Record<string, unknown>) {
      const id = "0198f6bf-8564-705c-8b95-56227195c5db";
      const row = {
        id,
        role: "attachment",
        displayName: null,
        sortOrder: 0,
        metadata: {},
        createdAt: new Date("2026-08-04T12:01:00.000Z"),
        updatedAt: new Date("2026-08-04T12:01:00.000Z"),
        ...input,
      };
      attachmentsById.set(id, row);
      return row;
    },

    async listAttachmentsByBlobId(blobId: string) {
      return [...attachmentsById.values()].filter(
        (attachment) => attachment.blobId === blobId,
      );
    },

    async countAttachmentsByBlobId(blobId: string) {
      return [...attachmentsById.values()].filter(
        (attachment) => attachment.blobId === blobId,
      ).length;
    },

    async findAttachmentById(id: string) {
      return attachmentsById.get(id);
    },

    async deleteAttachment(id: string) {
      attachmentsById.delete(id);
    },
  };
}

function createMemoryBlobStorage(deletedPaths: string[] = []) {
  return {
    sha256() {
      return "b".repeat(64);
    },
    buildStoragePath() {
      return "image/2026/08/generated.png";
    },
    async saveFile() {},
    async readFileFromStorage() {
      return Buffer.from("file");
    },
    async deleteFileFromStorage(_root: string, path: string) {
      deletedPaths.push(path);
    },
    extractImageDimensions() {
      return null;
    },
  };
}

describe("blob public response mapping", () => {
  test("omits internal storage path from public blob entries", async () => {
    setTestEnv();
    const { toPublicBlobEntry } = await import("./blob.service");

    const entry = toPublicBlobEntry(fakeBlobRow());

    expect(entry).toEqual({
      id: "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
      originalName: "daily-note.png",
      mimeType: "image/png",
      size: 2048,
      checksum: "a".repeat(64),
      metadata: {},
      width: 128,
      height: 64,
      duration: null,
      createdAt: "2026-08-04T12:00:00.000Z",
    });
    expect("storagePath" in entry).toBe(false);
  });
});

describe("blob attachment lifecycle", () => {
  test("keeps physical blobs while attachments reference them", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const deletedPaths: string[] = [];
    const repository = createMemoryBlobRepository();
    const service = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
      },
      repository,
      storage: createMemoryBlobStorage(deletedPaths),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
    });

    const attachment = await service.createAttachment(
      "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
      {
        ownerType: "diary",
        ownerId: "2026-08-04",
        role: "inline-image",
        displayName: "Daily image",
        sortOrder: 2,
        metadata: { alt: "desk" },
      },
    );

    expect(attachment).toMatchObject({
      blobId: "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
      ownerType: "diary",
      ownerId: "2026-08-04",
      role: "inline-image",
      displayName: "Daily image",
      sortOrder: 2,
      metadata: { alt: "desk" },
    });

    await expect(
      service.delete("0198f6bd-4f06-7289-b57d-62e8af51a4aa"),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
    expect(repository.blobsById.has("0198f6bd-4f06-7289-b57d-62e8af51a4aa")).toBe(
      true,
    );
    expect(deletedPaths).toEqual([]);

    await service.deleteAttachment(attachment.id);
    expect(
      await service.listAttachments("0198f6bd-4f06-7289-b57d-62e8af51a4aa"),
    ).toEqual([]);

    await service.delete("0198f6bd-4f06-7289-b57d-62e8af51a4aa");

    expect(repository.blobsById.has("0198f6bd-4f06-7289-b57d-62e8af51a4aa")).toBe(
      false,
    );
    expect(deletedPaths).toEqual([
      "image/2026/08/0198f6bd-4f06-7289-b57d-62e8af51a4aa.png",
    ]);
  });
});
