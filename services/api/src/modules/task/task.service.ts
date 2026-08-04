import { db } from "@/db/connection";
import { taskGroups, tasks } from "@/modules/task/task.schema";
import type { TaskStatus } from "@/modules/task/task.schema";
import type {
  CreateTaskGroupInput,
  CreateTaskInput,
  DeleteTaskGroupInput,
  DeleteTaskInput,
  GetTaskGroupInput,
  GetTaskInput,
  ListTaskGroupInput,
  ListTaskInput,
  TaskEntry,
  TaskGroupEntry,
  UpdateTaskGroupInput,
  UpdateTaskInput,
} from "@/modules/task/task.types";
import { AppError, ErrorCode } from "@/shared/errors";
import { and, desc, eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Task service — business logic and database operations.
//
// status ↔ completedAt sync is pure (no DB trigger), implemented by
// nextCompletedAt / resolveTaskUpdate below so it can be unit-tested without
// a database.
// ---------------------------------------------------------------------------

/** Shape of a task row the update resolver needs. */
export type TaskUpdateRowLike = {
  title: string;
  groupId: string;
  status: TaskStatus;
  completedAt: Date | null;
};

/** Partial update fields accepted by resolveTaskUpdate. */
export type TaskUpdatePatch = {
  title?: string;
  groupId?: string;
  status?: TaskStatus;
};

/** Result of resolving a task update: the next row values. */
export type TaskUpdateResult = {
  title: string;
  groupId: string;
  status: TaskStatus;
  completedAt: Date | null;
};

/**
 * Compute the completedAt for a status transition, determined solely by the
 * target status: `done` → `now` (enter or re-complete), any other status →
 * `null`.
 *
 * The "离开 done 清空" and "保持 done 不变" rules are implemented at the
 * resolveTaskUpdate level — see its doc comment.
 */
export function nextCompletedAt(
  nextStatus: TaskStatus,
  now: Date,
): Date | null {
  return nextStatus === "done" ? now : null;
}

/**
 * Combine a task update patch with the current row, resolving title / group /
 * status and the completedAt result. The completedAt rules:
 * - status enters `done` → set to `now` (via nextCompletedAt)
 * - status leaves `done` (any non-done value) → cleared to `null`
 * - status absent from the patch → current completedAt kept unchanged
 *   (covers "保持 done 不变" for title/groupId-only edits)
 */
export function resolveTaskUpdate(
  current: TaskUpdateRowLike,
  patch: TaskUpdatePatch,
  now: Date,
): TaskUpdateResult {
  const completedAt =
    patch.status === undefined
      ? current.completedAt
      : nextCompletedAt(patch.status, now);
  return {
    title: patch.title ?? current.title,
    groupId: patch.groupId ?? current.groupId,
    status: patch.status ?? current.status,
    completedAt,
  };
}

// ---- Row → entry conversion ------------------------------------------------

function toTaskGroupEntry(row: typeof taskGroups.$inferSelect): TaskGroupEntry {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTaskEntry(row: typeof tasks.$inferSelect): TaskEntry {
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

/** Throw NOT_FOUND unless a task group with the given id exists. */
async function assertTaskGroupExists(groupId: string): Promise<void> {
  const [group] = await db
    .select({ id: taskGroups.id })
    .from(taskGroups)
    .where(eq(taskGroups.id, groupId));
  if (!group) {
    throw new AppError(ErrorCode.NOT_FOUND, "任务组不存在", 404);
  }
}

// ---------------------------------------------------------------------------
// Task service — diary simple style: a plain object with methods over `db`.
// ---------------------------------------------------------------------------

export const taskService = {
  // ---- Task groups ----

  async createTaskGroup(input: CreateTaskGroupInput): Promise<TaskGroupEntry> {
    const [row] = await db
      .insert(taskGroups)
      .values({ title: input.title })
      .returning();
    return toTaskGroupEntry(row);
  },

  async listTaskGroups(
    input: ListTaskGroupInput,
  ): Promise<{ items: TaskGroupEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(taskGroups)
        .orderBy(desc(taskGroups.updatedAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(taskGroups),
    ]);
    return { items: items.map(toTaskGroupEntry), total: count };
  },

  async getTaskGroup(input: GetTaskGroupInput): Promise<TaskGroupEntry> {
    const [row] = await db
      .select()
      .from(taskGroups)
      .where(eq(taskGroups.id, input.id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "任务组不存在", 404);
    return toTaskGroupEntry(row);
  },

  async updateTaskGroup(input: UpdateTaskGroupInput): Promise<TaskGroupEntry> {
    const { id, ...data } = input;
    const [row] = await db
      .update(taskGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taskGroups.id, id))
      .returning();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "任务组不存在", 404);
    return toTaskGroupEntry(row);
  },

  async deleteTaskGroup(
    input: DeleteTaskGroupInput,
  ): Promise<{ id: string }> {
    const [row] = await db
      .delete(taskGroups)
      .where(eq(taskGroups.id, input.id))
      .returning({ id: taskGroups.id });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "任务组不存在", 404);
    return row;
  },

  // ---- Tasks ----

  async createTask(input: CreateTaskInput): Promise<TaskEntry> {
    await assertTaskGroupExists(input.groupId);
    const status = input.status ?? "todo";
    const completedAt = nextCompletedAt(status, new Date());
    try {
      const [row] = await db
        .insert(tasks)
        .values({
          groupId: input.groupId,
          title: input.title,
          status,
          completedAt,
        })
        .returning();
      return toTaskEntry(row);
    } catch (err) {
      // Group deleted between the existence check and the insert → FK 23503.
      if ((err as { code?: string }).code === "23503") {
        throw new AppError(ErrorCode.NOT_FOUND, "任务组不存在", 404);
      }
      throw err;
    }
  },

  async listTasks(
    input: ListTaskInput,
  ): Promise<{ items: TaskEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const conditions = [
      input.groupId ? eq(tasks.groupId, input.groupId) : undefined,
      input.status ? eq(tasks.status, input.status) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(desc(tasks.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(where),
    ]);
    return { items: items.map(toTaskEntry), total: count };
  },

  async getTask(input: GetTaskInput): Promise<TaskEntry> {
    const [row] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, input.id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "任务不存在", 404);
    return toTaskEntry(row);
  },

  async updateTask(input: UpdateTaskInput): Promise<TaskEntry> {
    const { id, ...patch } = input;

    const [current] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));
    if (!current) throw new AppError(ErrorCode.NOT_FOUND, "任务不存在", 404);

    // Moving a task to a different group requires that group to exist.
    if (patch.groupId !== undefined && patch.groupId !== current.groupId) {
      await assertTaskGroupExists(patch.groupId);
    }

    const resolved = resolveTaskUpdate(current, patch, new Date());
    let row: typeof tasks.$inferSelect | undefined;
    try {
      [row] = await db
        .update(tasks)
        .set({
          title: resolved.title,
          groupId: resolved.groupId,
          status: resolved.status,
          completedAt: resolved.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id))
        .returning();
    } catch (err) {
      // Group deleted between the existence check and the update → FK 23503.
      if ((err as { code?: string }).code === "23503") {
        throw new AppError(ErrorCode.NOT_FOUND, "任务组不存在", 404);
      }
      throw err;
    }
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "任务不存在", 404);
    return toTaskEntry(row);
  },

  async deleteTask(input: DeleteTaskInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(tasks)
      .where(eq(tasks.id, input.id))
      .returning({ id: tasks.id });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "任务不存在", 404);
    return row;
  },
};
