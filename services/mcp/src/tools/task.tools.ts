import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  taskService,
  CreateTaskSchema,
  ListTaskSchema,
  CreateTaskGroupSchema,
  ListTaskGroupSchema,
  UpdateTaskGroupSchema,
  TaskStatusSchema,
} from "@serenique/api";
import { runTool } from "./helpers";

// ---------------------------------------------------------------------------
// Task MCP tools — wrap task group + task service operations for AI consumption.
// Field contract follows the API source: title (not content), groupId (uuid),
// status enum (todo / done / abandon), completedAt.
// ---------------------------------------------------------------------------

const TaskIdSchema = z.object({
  id: z.string().uuid().describe("任务 ID (UUID)"),
});

const TaskGroupIdSchema = z.object({
  id: z.string().uuid().describe("任务组 ID (UUID)"),
});

// ---- Task group tool schemas ----------------------------------------------

const CreateTaskGroupToolSchema = CreateTaskGroupSchema.extend({
  title: CreateTaskGroupSchema.shape.title.describe(
    "任务组标题，最长 200 字",
  ),
});

const ListTaskGroupToolSchema = ListTaskGroupSchema.extend({
  page: ListTaskGroupSchema.shape.page.describe("页码，从 1 开始，默认 1"),
  pageSize: ListTaskGroupSchema.shape.pageSize.describe(
    "每页条数，默认 10，最大 50",
  ),
});

const UpdateTaskGroupToolSchema = UpdateTaskGroupSchema.extend({
  id: z.string().uuid().describe("任务组 ID (UUID)"),
  title: UpdateTaskGroupSchema.shape.title.describe("新的任务组标题"),
});

// ---- Task tool schemas -----------------------------------------------------
// UpdateTaskSchema carries a refine ("至少需要提供一个待更新字段"), so it
// cannot be `.extend()`-ed (ZodEffects); rebuild it here with identical
// constraints.

const CreateTaskToolSchema = CreateTaskSchema.extend({
  title: CreateTaskSchema.shape.title.describe("任务标题，最长 200 字"),
  groupId: CreateTaskSchema.shape.groupId.describe("所属任务组 ID (UUID)"),
  status: CreateTaskSchema.shape.status.describe(
    "任务状态：todo / done / abandon，可选，默认 todo",
  ),
  dueDate: CreateTaskSchema.shape.dueDate.describe(
    "截止日期 (YYYY-MM-DD)，可选",
  ),
});

// ListTaskSchema carries a refine (dueDateFrom <= dueDateTo), and zod v4's
// `.extend()` refuses to overwrite keys on schemas with refinements — use
// `.safeExtend()`, which merges the shape and keeps the checks intact.

const ListTaskToolSchema = ListTaskSchema.safeExtend({
  page: ListTaskSchema.shape.page.describe("页码，从 1 开始，默认 1"),
  pageSize: ListTaskSchema.shape.pageSize.describe(
    "每页条数，默认 10，最大 50",
  ),
  groupId: ListTaskSchema.shape.groupId.describe(
    "按所属任务组过滤 (UUID)，可选",
  ),
  status: ListTaskSchema.shape.status.describe(
    "按状态过滤：todo / done / abandon，可选",
  ),
  dueDateFrom: ListTaskSchema.shape.dueDateFrom.describe(
    "按截止日期范围过滤起点 (YYYY-MM-DD)，可选",
  ),
  dueDateTo: ListTaskSchema.shape.dueDateTo.describe(
    "按截止日期范围过滤终点 (YYYY-MM-DD)，可选",
  ),
});

const UpdateTaskToolSchema = z
  .object({
    id: z.string().uuid().describe("任务 ID (UUID)"),
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("新的任务标题，可选"),
    groupId: z.string().uuid().optional().describe("新的所属任务组 ID (UUID)，可选"),
    status: TaskStatusSchema.optional().describe(
      "新的任务状态：todo / done / abandon，可选",
    ),
    dueDate: z
      .string()
      .optional()
      .describe("新的截止日期 (YYYY-MM-DD)，传空串表示清除，不传表示保持不变"),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.groupId !== undefined ||
      v.status !== undefined ||
      v.dueDate !== undefined,
    "至少需要提供一个待更新字段",
  );

export function registerTaskTools(server: McpServer) {
  // ---- Task groups ----

  server.registerTool(
    "create_task_group",
    {
      title: "Create Task Group",
      description:
        "创建一个任务组。任务组用于把相关的任务组织在一起，创建后可通过 create_task 向组内添加任务。",
      inputSchema: CreateTaskGroupToolSchema,
    },
    async (input) => runTool(() => taskService.createTaskGroup(input)),
  );

  server.registerTool(
    "list_task_groups",
    {
      title: "List Task Groups",
      description: "分页查询任务组列表，按最近更新排序。",
      inputSchema: ListTaskGroupToolSchema,
    },
    async (input) => runTool(() => taskService.listTaskGroups(input)),
  );

  server.registerTool(
    "get_task_group",
    {
      title: "Get Task Group",
      description: "根据 ID 获取单个任务组的详细信息。",
      inputSchema: TaskGroupIdSchema,
    },
    async (input) => runTool(() => taskService.getTaskGroup(input)),
  );

  server.registerTool(
    "update_task_group",
    {
      title: "Update Task Group",
      description: "重命名任务组。只能修改标题。",
      inputSchema: UpdateTaskGroupToolSchema,
    },
    async (input) => runTool(() => taskService.updateTaskGroup(input)),
  );

  server.registerTool(
    "delete_task_group",
    {
      title: "Delete Task Group",
      description:
        "删除一个任务组。组内的所有任务会一并被删除，此操作不可撤销。",
      inputSchema: TaskGroupIdSchema,
    },
    async (input) => runTool(() => taskService.deleteTaskGroup(input)),
  );

  // ---- Tasks ----

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description:
        "在指定任务组下创建一条任务。状态可选，默认 todo；若直接创建为 done 状态会自动记录完成时间。",
      inputSchema: CreateTaskToolSchema,
    },
    async (input) => runTool(() => taskService.createTask(input)),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description:
        "分页查询任务列表，按创建时间倒序。可按任务组 (groupId) 或状态 (status) 过滤。",
      inputSchema: ListTaskToolSchema,
    },
    async (input) => runTool(() => taskService.listTasks(input)),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description:
        "根据 ID 获取单条任务的完整信息，包括状态、所属任务组与完成时间。",
      inputSchema: TaskIdSchema,
    },
    async (input) => runTool(() => taskService.getTask(input)),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update Task",
      description:
        "更新任务：可修改标题、所属任务组或状态。状态进入 done 时自动记录完成时间，离开 done 时清空完成时间。至少需要提供一个待更新字段。",
      inputSchema: UpdateTaskToolSchema,
    },
    async (input) =>
      runTool(() =>
        taskService.updateTask({
          ...input,
          dueDate: input.dueDate === "" ? null : input.dueDate,
        }),
      ),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete Task",
      description: "删除一条任务。此操作不可撤销。",
      inputSchema: TaskIdSchema,
    },
    async (input) => runTool(() => taskService.deleteTask(input)),
  );
}
