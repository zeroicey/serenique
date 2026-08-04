import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTestEnv } from "@/test/helpers";

async function makeBlobRoot() {
  return mkdtemp(join(tmpdir(), "serenique-blob-root-"));
}

describe("blob root initialization", () => {
  test("tolerates unrelated top-level files and creates a managed objects directory", async () => {
    setTestEnv();
    const { initBlobRoot } = await import("./storage");
    const root = await makeBlobRoot();
    await writeFile(join(root, ".DS_Store"), "");

    await initBlobRoot(root);

    const entries = await readdir(root);
    expect(entries).toContain(".DS_Store");
    expect(entries).toContain("objects");
  });

  test("stores and lists files under the managed objects directory only", async () => {
    setTestEnv();
    const { initBlobRoot, listStoragePaths, saveFile } = await import(
      "./storage"
    );
    const root = await makeBlobRoot();
    await initBlobRoot(root);
    await writeFile(join(root, ".DS_Store"), "");

    await saveFile(root, "image/2026/08/blob.png", Buffer.from("new"));

    expect(
      await Bun.file(join(root, "objects/image/2026/08/blob.png")).text(),
    ).toBe("new");
    expect(await listStoragePaths(root)).toEqual(["image/2026/08/blob.png"]);
  });

  test("can still open legacy files stored directly under the old root layout", async () => {
    setTestEnv();
    const { initBlobRoot, openFileFromStorage } = await import("./storage");
    const root = await makeBlobRoot();
    await initBlobRoot(root);
    await mkdir(join(root, "image/2026/08"), { recursive: true });
    await writeFile(join(root, "image/2026/08/legacy.png"), "legacy");

    const { body, size } = await openFileFromStorage(
      root,
      "image/2026/08/legacy.png",
    );

    expect(size).toBe(6);
    expect(await body.text()).toBe("legacy");
  });
});
