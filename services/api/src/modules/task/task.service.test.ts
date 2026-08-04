import { describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// Task module tests — pure functions and Zod schemas only. No database needed.
// ---------------------------------------------------------------------------

function setTestEnv() {
  process.env.DATABASE_URL ??=
    "postgresql://serenique:serenique@127.0.0.1:5432/serenique";
  process.env.BLOB_ROOT ??= "/tmp/serenique-api-task-test";
  process.env.BLOB_MAX_SIZE ??= "104857600";
  process.env.NODE_ENV ??= "test";
}

const NOW = new Date("2026-08-05T10:00:00.000Z");
const OLD = new Date("2026-08-04T08:00:00.000Z");

describe("nextCompletedAt — target-status-determined completedAt", () => {
  test("entering done sets completedAt to now", async () => {
    setTestEnv();
    const { nextCompletedAt } = await import("./task.service");

    expect(nextCompletedAt("done", NOW)).toEqual(NOW);
  });

  test("non-done statuses resolve to null (covers leaving done)", async () => {
    setTestEnv();
    const { nextCompletedAt } = await import("./task.service");

    expect(nextCompletedAt("todo", NOW)).toBeNull();
    expect(nextCompletedAt("abandon", NOW)).toBeNull();
  });
});

describe("resolveTaskUpdate — combines patch with current row", () => {
  test("entering done writes completedAt = now", async () => {
    setTestEnv();
    const { resolveTaskUpdate } = await import("./task.service");

    const result = resolveTaskUpdate(
      { title: "写周报", groupId: "g1", status: "todo", completedAt: null },
      { status: "done" },
      NOW,
    );

    expect(result).toEqual({
      title: "写周报",
      groupId: "g1",
      status: "done",
      completedAt: NOW,
    });
  });

  test("leaving done clears completedAt", async () => {
    setTestEnv();
    const { resolveTaskUpdate } = await import("./task.service");

    const result = resolveTaskUpdate(
      { title: "写周报", groupId: "g1", status: "done", completedAt: OLD },
      { status: "todo" },
      NOW,
    );

    expect(result.status).toBe("todo");
    expect(result.completedAt).toBeNull();
  });

  test("staying done (status not in patch) keeps completedAt unchanged", async () => {
    setTestEnv();
    const { resolveTaskUpdate } = await import("./task.service");

    const result = resolveTaskUpdate(
      { title: "写周报", groupId: "g1", status: "done", completedAt: OLD },
      { title: "写周报（终稿）" },
      NOW,
    );

    expect(result.title).toBe("写周报（终稿）");
    expect(result.status).toBe("done");
    expect(result.completedAt).toEqual(OLD);
  });

  test("re-completing an already-done task refreshes completedAt", async () => {
    setTestEnv();
    const { resolveTaskUpdate } = await import("./task.service");

    const result = resolveTaskUpdate(
      { title: "写周报", groupId: "g1", status: "done", completedAt: OLD },
      { status: "done" },
      NOW,
    );

    expect(result.completedAt).toEqual(NOW);
  });

  test("combines title/groupId changes alongside a status change", async () => {
    setTestEnv();
    const { resolveTaskUpdate } = await import("./task.service");

    const result = resolveTaskUpdate(
      { title: "写周报", groupId: "g1", status: "todo", completedAt: null },
      { title: "写周报（终稿）", groupId: "g2", status: "done" },
      NOW,
    );

    expect(result).toEqual({
      title: "写周报（终稿）",
      groupId: "g2",
      status: "done",
      completedAt: NOW,
    });
  });
});

describe("task zod schemas", () => {
  test("CreateTaskSchema accepts valid payload and defaults status to todo", async () => {
    setTestEnv();
    const { CreateTaskSchema } = await import("./task.types");

    expect(
      CreateTaskSchema.safeParse({
        title: "写周报",
        groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      }).success,
    ).toBe(true);
    const parsed = CreateTaskSchema.parse({
      title: "写周报",
      groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
    });
    expect(parsed.status).toBe("todo");
  });

  test("CreateTaskSchema rejects invalid status values", async () => {
    setTestEnv();
    const { CreateTaskSchema } = await import("./task.types");

    const parsed = CreateTaskSchema.safeParse({
      title: "写周报",
      groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      status: "in_progress",
    });
    expect(parsed.success).toBe(false);
  });

  test("CreateTaskSchema enforces title bounds", async () => {
    setTestEnv();
    const { CreateTaskSchema } = await import("./task.types");

    expect(
      CreateTaskSchema.safeParse({
        title: "",
        groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      }).success,
    ).toBe(false);
    expect(
      CreateTaskSchema.safeParse({
        title: "x".repeat(201),
        groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      }).success,
    ).toBe(false);
    expect(
      CreateTaskSchema.safeParse({
        title: "x".repeat(200),
        groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      }).success,
    ).toBe(true);
  });

  test("CreateTaskSchema rejects whitespace-only title", async () => {
    setTestEnv();
    const { CreateTaskSchema } = await import("./task.types");

    expect(
      CreateTaskSchema.safeParse({
        title: "   ",
        groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      }).success,
    ).toBe(false);
  });

  test("CreateTaskSchema rejects non-uuid groupId", async () => {
    setTestEnv();
    const { CreateTaskSchema } = await import("./task.types");

    expect(
      CreateTaskSchema.safeParse({ title: "写周报", groupId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  test("UpdateTaskSchema requires at least one field", async () => {
    setTestEnv();
    const { UpdateTaskSchema } = await import("./task.types");

    expect(UpdateTaskSchema.safeParse({}).success).toBe(false);
    expect(UpdateTaskSchema.safeParse({ title: "新标题" }).success).toBe(true);
    expect(UpdateTaskSchema.safeParse({ status: "abandon" }).success).toBe(true);
  });

  test("ListTaskSchema coerces page/pageSize and accepts optional filters", async () => {
    setTestEnv();
    const { ListTaskSchema } = await import("./task.types");

    const parsed = ListTaskSchema.parse({
      page: "2",
      pageSize: "20",
      groupId: "0198f6d0-9e7c-71d7-8214-2a0f7f5f3001",
      status: "done",
    });
    expect(parsed).toMatchObject({ page: 2, pageSize: 20, status: "done" });
  });

  test("CreateTaskGroupSchema enforces title bounds", async () => {
    setTestEnv();
    const { CreateTaskGroupSchema } = await import("./task.types");

    expect(CreateTaskGroupSchema.safeParse({ title: "" }).success).toBe(false);
    expect(CreateTaskGroupSchema.safeParse({ title: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(CreateTaskGroupSchema.safeParse({ title: "工作" }).success).toBe(true);
  });
});
