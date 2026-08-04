import { describe, expect, test } from "bun:test";

function setTestEnv() {
  process.env.DATABASE_URL ??=
    "postgresql://serenique:serenique@127.0.0.1:5432/serenique";
  process.env.BLOB_ROOT ??= "/tmp/serenique-api-blob-handler-test";
  process.env.BLOB_MAX_SIZE ??= "104857600";
  process.env.NODE_ENV ??= "test";
}

describe("parseBlobRange", () => {
  test("parses bounded, open-ended, and suffix byte ranges", async () => {
    setTestEnv();
    const { parseBlobRange } = await import("./blob.handler");

    expect(parseBlobRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseBlobRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(parseBlobRange("bytes=-4", 10)).toEqual({ start: 6, end: 9 });
  });

  test("rejects invalid or unsatisfiable ranges", async () => {
    setTestEnv();
    const { parseBlobRange } = await import("./blob.handler");

    expect(parseBlobRange("items=2-5", 10)).toBeNull();
    expect(parseBlobRange("bytes=8-2", 10)).toBeNull();
    expect(parseBlobRange("bytes=10-12", 10)).toBeNull();
  });
});
