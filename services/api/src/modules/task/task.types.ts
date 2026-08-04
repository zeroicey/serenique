import { z } from "zod";
import type { TaskStatus } from "@/modules/task/task.schema";

// ---------------------------------------------------------------------------
// Task module — request/response types
// ---------------------------------------------------------------------------

export const TaskStatusSchema = z.enum(["todo", "done", "abandon"]);

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  groupId: z.string().uuid(),
  status: TaskStatusSchema.default("todo"),
});

export const UpdateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    groupId: z.string().uuid().optional(),
    status: TaskStatusSchema.optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.groupId !== undefined ||
      v.status !== undefined,
    "至少需要提供一个待更新字段",
  );

export const ListTaskSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  groupId: z.string().uuid().optional(),
  status: TaskStatusSchema.optional(),
});

export const CreateTaskGroupSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const ListTaskGroupSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const UpdateTaskGroupSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

// ---- Input types (service layer) ------------------------------------------
// z.input keeps defaulted fields optional so MCP can pass bare objects.

export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTaskInput = { id: string } & z.input<typeof UpdateTaskSchema>;
// List inputs use z.infer: z.coerce produces an `unknown` input type for
// page/pageSize, so the parsed (number) type is what the service consumes.
export type ListTaskInput = z.infer<typeof ListTaskSchema>;
export type GetTaskInput = { id: string };
export type DeleteTaskInput = { id: string };

export type CreateTaskGroupInput = z.input<typeof CreateTaskGroupSchema>;
export type ListTaskGroupInput = z.infer<typeof ListTaskGroupSchema>;
export type GetTaskGroupInput = { id: string };
export type UpdateTaskGroupInput = { id: string } & z.input<
  typeof UpdateTaskGroupSchema
>;
export type DeleteTaskGroupInput = { id: string };

// ---- Entry types (response layer) — times are ISO strings ---------------

export type TaskEntry = {
  id: string;
  groupId: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskGroupEntry = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
