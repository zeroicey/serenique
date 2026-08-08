import { describe, expect, test } from "bun:test";
import type { TagJoinRow } from "@/modules/tag/tag.mappers";
import { setTestEnv } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Tag module unit tests — pure functions (tag.domain), mappers and Zod
// schemas only. No database needed.
// ---------------------------------------------------------------------------

describe("normalizeTagName — trim + lowercase normalization", () => {
  test("trims surrounding whitespace", async () => {
    setTestEnv();
    const { normalizeTagName } = await import("./tag.domain");
    expect(normalizeTagName("  工作  ")).toBe("工作");
    expect(normalizeTagName("\t读书\n")).toBe("读书");
  });

  test("lowercases latin tags (storage = display name)", async () => {
    setTestEnv();
    const { normalizeTagName } = await import("./tag.domain");
    expect(normalizeTagName("Work")).toBe("work");
    expect(normalizeTagName("  WORK ")).toBe("work");
    expect(normalizeTagName("ProjectX")).toBe("projectx");
  });

  test("Chinese tags are a no-op (no case concept)", async () => {
    setTestEnv();
    const { normalizeTagName } = await import("./tag.domain");
    expect(normalizeTagName("工作")).toBe("工作");
    expect(normalizeTagName("闪念")).toBe("闪念");
  });

  test("empty/whitespace-only input normalizes to empty string", async () => {
    setTestEnv();
    const { normalizeTagName } = await import("./tag.domain");
    expect(normalizeTagName("")).toBe("");
    expect(normalizeTagName("   ")).toBe("");
  });
});

describe("uniqueTagIds — order-preserving dedup", () => {
  test("removes duplicates keeping first-seen order", async () => {
    setTestEnv();
    const { uniqueTagIds } = await import("./tag.domain");
    expect(uniqueTagIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
    expect(uniqueTagIds(["a"])).toEqual(["a"]);
    expect(uniqueTagIds([])).toEqual([]);
  });
});

describe("ownerType registry", () => {
  test("registered ownerType passes; unregistered throws VALIDATION 400", async () => {
    setTestEnv();
    // Importing the service registers the "moment" validator at module load.
    await import("./tag.service");
    const {
      assertRegisteredOwnerType,
      getOwnerValidator,
      registerOwnerValidator,
    } = await import("./tag.domain");

    assertRegisteredOwnerType("moment");
    expect(getOwnerValidator("moment")).toBeTypeOf("function");

    expect(() => assertRegisteredOwnerType("diary")).toThrow(
      expect.objectContaining({ code: "VALIDATION", status: 400 }),
    );
    expect(() => getOwnerValidator("diary")).toThrow(
      expect.objectContaining({ code: "VALIDATION", status: 400 }),
    );

    // Registration is extensible for future owner types.
    registerOwnerValidator("diary", async () => {});
    assertRegisteredOwnerType("diary");
  });
});

describe("isUniqueViolation / isForeignKeyViolation — DB error guards", () => {
  test("matches 23505 with the target constraint (cause-wrapped like drizzle)", async () => {
    setTestEnv();
    const { isUniqueViolation } = await import("./tag.domain");

    const drizzleWrapped = new Error("Failed query", {
      cause: {
        code: "23505",
        constraint: "tags_name_unique",
      },
    });
    expect(isUniqueViolation(drizzleWrapped, "tags_name_unique")).toBe(true);

    // Raw driver error (no wrapper).
    expect(
      isUniqueViolation(
        { code: "23505", constraint: "tags_name_unique" },
        "tags_name_unique",
      ),
    ).toBe(true);

    // PG server reports constraint_name.
    expect(
      isUniqueViolation(
        { code: "23505", constraint_name: "tags_name_unique" },
        "tags_name_unique",
      ),
    ).toBe(true);

    // Wrong constraint or wrong code → false.
    expect(
      isUniqueViolation({ code: "23505", constraint: "other_unique" }, "tags_name_unique"),
    ).toBe(false);
    expect(isUniqueViolation({ code: "23503" }, "tags_name_unique")).toBe(false);
    expect(isUniqueViolation(null, "tags_name_unique")).toBe(false);
  });

  test("matches foreign-key violations (23503)", async () => {
    setTestEnv();
    const { isForeignKeyViolation } = await import("./tag.domain");
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
  });
});

describe("tag zod schemas", () => {
  test("CreateTagSchema validates name bounds and trims", async () => {
    setTestEnv();
    const { CreateTagSchema, TagNameSchema } = await import("./tag.types");

    expect(CreateTagSchema.safeParse({ name: "工作" }).success).toBe(true);
    expect(CreateTagSchema.parse({ name: "  工作  " }).name).toBe("工作");
    expect(CreateTagSchema.safeParse({ name: "" }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "x".repeat(33) }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "x".repeat(32) }).success).toBe(true);

    // RenameTagSchema shares the same name contract.
    const { RenameTagSchema } = await import("./tag.types");
    expect(RenameTagSchema.safeParse({ name: "" }).success).toBe(false);
    expect(RenameTagSchema.safeParse({ name: "新名字" }).success).toBe(true);
    expect(TagNameSchema).toBeDefined();
  });

  test("ListTagSchema coerces page/pageSize", async () => {
    setTestEnv();
    const { ListTagSchema } = await import("./tag.types");
    expect(ListTagSchema.parse({})).toMatchObject({ page: 1, pageSize: 10 });
    expect(ListTagSchema.parse({ page: "3", pageSize: "25" })).toMatchObject({
      page: 3,
      pageSize: 25,
    });
  });

  test("AttachTagSchema / DetachTagSchema validate shape, not ownerType (registry's job)", async () => {
    setTestEnv();
    const { AttachTagSchema, DetachTagSchema } = await import("./tag.types");

    const body = { ownerType: "moment", ownerId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f1001" };
    expect(AttachTagSchema.parse(body)).toEqual(body);
    expect(DetachTagSchema.parse(body)).toEqual(body);
    expect(AttachTagSchema.safeParse({ ownerType: "", ownerId: "x" }).success).toBe(
      false,
    );
  });

  test("ReplaceTagsSchema requires an array of uuids", async () => {
    setTestEnv();
    const { ReplaceTagsSchema } = await import("./tag.types");

    expect(ReplaceTagsSchema.parse({ tagIds: [] }).tagIds).toEqual([]);
    expect(
      ReplaceTagsSchema.parse({
        tagIds: ["0198f6d0-9e7c-71d7-8214-2a0f7f5f5001"],
      }).tagIds,
    ).toHaveLength(1);
    expect(ReplaceTagsSchema.safeParse({ tagIds: ["not-a-uuid"] }).success).toBe(
      false,
    );
    expect(ReplaceTagsSchema.safeParse({}).success).toBe(false);
  });
});

describe("tag mappers", () => {
  test("toTagEntry converts a row with the given momentCount", async () => {
    setTestEnv();
    const { toTagEntry } = await import("./tag.mappers");
    const { fakeTagRow } = await import("@/test/helpers");

    expect(toTagEntry(fakeTagRow())).toEqual({
      id: "0198f6d0-9e7c-71d7-8214-2a0f7f5f5001",
      name: "工作",
      momentCount: 0,
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
    });
    expect(toTagEntry(fakeTagRow(), 3).momentCount).toBe(3);
  });

  test("toTagRelationEntry converts a relation row", async () => {
    setTestEnv();
    const { toTagRelationEntry } = await import("./tag.mappers");
    const { fakeTagRelationRow } = await import("@/test/helpers");

    expect(toTagRelationEntry(fakeTagRelationRow())).toEqual({
      id: "0198f6d0-9e7c-71d7-8214-2a0f7f5f5002",
      tagId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f5001",
      ownerType: "moment",
      ownerId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f1001",
      createdAt: "2026-08-05T12:00:00.000Z",
    });
  });

  test("groupTagEntriesByOwnerId groups join rows and applies moment counts", async () => {
    setTestEnv();
    const { groupTagEntriesByOwnerId } = await import("./tag.mappers");
    const { fakeTagRelationRow, fakeTagRow } = await import("@/test/helpers");

    const m1 = "0198f6d0-9e7c-71d7-8214-2a0f7f5f1001";
    const m2 = "0198f6d0-9e7c-71d7-8214-2a0f7f5f1002";
    const t1 = fakeTagRow({ id: "tag-1", name: "工作" });
    const t2 = fakeTagRow({ id: "tag-2", name: "读书" });
    const rows: TagJoinRow[] = [
      { relation: fakeTagRelationRow({ id: "r-1", ownerId: m1, tagId: t1.id }), tag: t1 },
      { relation: fakeTagRelationRow({ id: "r-2", ownerId: m2, tagId: t1.id }), tag: t1 },
      { relation: fakeTagRelationRow({ id: "r-3", ownerId: m1, tagId: t2.id }), tag: t2 },
    ];
    const counts = new Map([
      [t1.id, 2],
      [t2.id, 1],
    ]);

    const grouped = groupTagEntriesByOwnerId(rows, counts);
    expect([...grouped.keys()].sort()).toEqual([m1, m2]);
    expect(grouped.get(m1)!.map((t) => t.name)).toEqual(["工作", "读书"]);
    expect(grouped.get(m1)![0].momentCount).toBe(2);
    expect(grouped.get(m2)![0].momentCount).toBe(2);

    // Without counts → momentCount defaults to 0.
    const bare = groupTagEntriesByOwnerId([rows[0]]);
    expect(bare.get(m1)![0].momentCount).toBe(0);
  });
});
