import { taskGroups, tasks } from "@/modules/task/task.schema";
import type { TaskEntry, TaskGroupEntry } from "@/modules/task/task.types";

// ---------------------------------------------------------------------------
// Task mappers — row → entry conversion. Pure functions, no DB / IO.
// ---------------------------------------------------------------------------

export function toTaskGroupEntry(
  row: typeof taskGroups.$inferSelect,
): TaskGroupEntry {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTaskEntry(row: typeof tasks.$inferSelect): TaskEntry {
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
