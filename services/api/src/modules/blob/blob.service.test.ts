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
  options: {
    findBlobByChecksumSequence?: Array<Record<string, any> | undefined>;
    insertBlobError?: unknown;
  } = {},
) {
  const blobsById = new Map<string, Record<string, any>>(
    initialRows.map((row) => [row.id, row]),
  );
  const attachmentsById = new Map<string, Record<string, any>>();
  let checksumLookupCount = 0;

  return {
    blobsById,
    attachmentsById,

    async findBlobByChecksum(checksum: string) {
      if (options.findBlobByChecksumSequence) {
        const next = options.findBlobByChecksumSequence[checksumLookupCount];
        checksumLookupCount += 1;
        return next;
      }
      return [...blobsById.values()].find((row) => row.checksum === checksum);
    },

    async insertBlob(input: Record<string, unknown>) {
      if (options.insertBlobError) throw options.insertBlobError;

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

    async listBlobStoragePaths() {
      return [...blobsById.values()].map((row) => String(row.storagePath));
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

function createMemoryBlobStorage(
  deletedPaths: string[] = [],
  options: {
    savedPaths?: string[];
    diskPaths?: string[];
    storagePath?: string;
  } = {},
) {
  return {
    sha256() {
      return "b".repeat(64);
    },
    buildStoragePath() {
      return options.storagePath ?? "image/2026/08/generated.png";
    },
    async saveFile(_root: string, path: string) {
      options.savedPaths?.push(path);
    },
    async readFileFromStorage() {
      return Buffer.from("file");
    },
    async deleteFileFromStorage(_root: string, path: string) {
      deletedPaths.push(path);
    },
    async listStoragePaths() {
      return options.diskPaths ?? [];
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

describe("blob upload consistency", () => {
  test("removes the saved disk file when inserting the blob row fails", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const savedPaths: string[] = [];
    const deletedPaths: string[] = [];
    const repository = createMemoryBlobRepository([], {
      insertBlobError: new Error("database unavailable"),
    });
    const service = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
      },
      repository,
      storage: createMemoryBlobStorage(deletedPaths, {
        savedPaths,
        storagePath: "text/2026/08/generated.txt",
      }),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
    });

    await expect(
      service.upload(new File(["hello"], "note.txt", { type: "text/plain" })),
    ).rejects.toThrow("database unavailable");

    expect(savedPaths).toEqual(["text/2026/08/generated.txt"]);
    expect(deletedPaths).toEqual(["text/2026/08/generated.txt"]);
    expect(repository.blobsById.size).toBe(0);
  });

  test("cleans the redundant disk file and returns the existing blob on checksum races", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const savedPaths: string[] = [];
    const deletedPaths: string[] = [];
    const existing = fakeBlobRow({ checksum: "b".repeat(64) });
    const duplicateChecksumError = Object.assign(new Error("duplicate checksum"), {
      code: "23505",
      constraint: "blobs_checksum_unique",
    });
    const repository = createMemoryBlobRepository([], {
      findBlobByChecksumSequence: [undefined, existing],
      insertBlobError: duplicateChecksumError,
    });
    const service = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
      },
      repository,
      storage: createMemoryBlobStorage(deletedPaths, {
        savedPaths,
        storagePath: "text/2026/08/generated.txt",
      }),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
    });

    const result = await service.upload(
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );

    expect(result.id).toBe("0198f6bd-4f06-7289-b57d-62e8af51a4aa");
    expect(savedPaths).toEqual(["text/2026/08/generated.txt"]);
    expect(deletedPaths).toEqual(["text/2026/08/generated.txt"]);
  });

  test("deletes disk files that no blob row references", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const deletedPaths: string[] = [];
    const repository = createMemoryBlobRepository([
      fakeBlobRow({
        storagePath: "image/2026/08/kept.png",
      }),
    ]);
    const service = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
      },
      repository,
      storage: createMemoryBlobStorage(deletedPaths, {
        diskPaths: [
          "image/2026/08/kept.png",
          "application/2026/08/orphan.pdf",
        ],
      }),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
    });

    const result = await service.cleanupOrphanFiles();

    expect(result).toEqual({
      checked: 2,
      deleted: ["application/2026/08/orphan.pdf"],
      failed: [],
    });
    expect(deletedPaths).toEqual(["application/2026/08/orphan.pdf"]);
  });
});

describe("blob file transfer", () => {
  test("returns a blob body descriptor instead of materializing a buffer", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const repository = createMemoryBlobRepository();
    const service = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
      },
      repository,
      storage: {
        ...createMemoryBlobStorage(),
        async openFileFromStorage() {
          return { body: new Blob(["file"]), size: 4 };
        },
      },
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
    });

    const file = await service.getFile("0198f6bd-4f06-7289-b57d-62e8af51a4aa");

    expect(file).toMatchObject({
      mimeType: "image/png",
      filename: "daily-note.png",
      size: 4,
    });
    expect(file.body).toBeInstanceOf(Blob);
    expect("buf" in file).toBe(false);
  });
});

describe("blob signed access links", () => {
  test("creates and validates temporary access links", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const now = new Date("2026-08-04T00:00:00.000Z");
    const service = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
        BLOB_SIGNING_SECRET: "x".repeat(48),
      },
      repository: createMemoryBlobRepository(),
      storage: createMemoryBlobStorage(),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
      now: () => now,
    });

    const link = await service.createAccessLink(
      "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
      {
        baseUrl: "https://api.example.test",
        expiresInSeconds: 60,
      },
    );

    expect(link.expires).toBe(Math.floor(now.getTime() / 1000) + 60);
    expect(link.expiresAt).toBe("2026-08-04T00:01:00.000Z");
    expect(
      link.path.startsWith(
        "/api/blobs/0198f6bd-4f06-7289-b57d-62e8af51a4aa/file?",
      ),
    ).toBe(true);
    expect(
      link.url.startsWith(
        "https://api.example.test/api/blobs/0198f6bd-4f06-7289-b57d-62e8af51a4aa/file?",
      ),
    ).toBe(true);
    expect(link.signature.length).toBeGreaterThan(20);

    expect(() =>
      service.verifyAccessSignature("0198f6bd-4f06-7289-b57d-62e8af51a4aa", {
        expires: String(link.expires),
        signature: link.signature,
      }),
    ).not.toThrow();
  });

  test("rejects expired or tampered access signatures", async () => {
    setTestEnv();
    const { createBlobService } = (await import("./blob.service")) as any;
    const issuedAt = new Date("2026-08-04T00:00:00.000Z");
    const repository = createMemoryBlobRepository();
    const issuingService = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
        BLOB_SIGNING_SECRET: "x".repeat(48),
      },
      repository,
      storage: createMemoryBlobStorage(),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
      now: () => issuedAt,
    });
    const link = await issuingService.createAccessLink(
      "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
      {
        baseUrl: "https://api.example.test",
        expiresInSeconds: 60,
      },
    );
    const expiredService = createBlobService({
      env: {
        BLOB_ROOT: "/tmp/serenique-api-blob-test",
        BLOB_MAX_SIZE: 104857600,
        BLOB_SIGNING_SECRET: "x".repeat(48),
      },
      repository,
      storage: createMemoryBlobStorage(),
      randomUUID: () => "0198f6c3-30da-7193-b914-3e92383fe0ca",
      now: () => new Date("2026-08-04T00:02:00.000Z"),
    });

    expect(() =>
      expiredService.verifyAccessSignature(
        "0198f6bd-4f06-7289-b57d-62e8af51a4aa",
        {
          expires: String(link.expires),
          signature: link.signature,
        },
      ),
    ).toThrow("临时访问链接已过期");

    expect(() =>
      issuingService.verifyAccessSignature(
        "0198f6c8-3a3f-7142-8771-0dca5e5552ec",
        {
          expires: String(link.expires),
          signature: link.signature,
        },
      ),
    ).toThrow("临时访问签名无效");
  });
});
