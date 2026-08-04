import type { TaskStatus } from "@/modules/task/task.schema";

// ---------------------------------------------------------------------------
// Task domain — pure business rules for the status ↔ completedAt sync.
// No DB / IO imports, so these are unit-testable without a database.
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
