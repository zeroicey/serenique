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
