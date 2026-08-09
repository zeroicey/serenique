import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { taskService } from "@/modules/task/task.service";
import {
  type CreateTaskInput,
  type ListTaskInput,
  type UpdateTaskInput,
} from "@/modules/task/task.types";
import { eventService } from "@/modules/event/event.service";
import { momentService } from "@/modules/moment/moment.service";

// ---------------------------------------------------------------------------
// AI 助手业务工具：把现有 service 层（task/event/moment）暴露给 agent。
//
// 错误映射：AgentToolResult 类型上没有 isError 字段，且 SDK runner
// （pi-agent-core agent-loop.js）只把 execute 抛出的异常标记为错误（返回体上的
// isError 会被忽略）。因此 run() 失败时直接 throw（带「操作失败: …」中文前缀），
// runner 捕获后置 isError: true，错误消息进入 tool result content。
// ---------------------------------------------------------------------------

/** AgentToolResult 统一构建：成功 → JSON 文本；失败 → throw（runner 标记 isError）。 */
export function formatEntry(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function run(
  fn: () => Promise<unknown>,
): Promise<{ content: { type: "text"; text: string }[]; details: {} }> {
  try {
    return { content: [{ type: "text", text: formatEntry(await fn()) }], details: {} };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`操作失败: ${message}`);
  }
}

/** groupId 省略时落到首个任务组；没有组则自动创建「默认」组。 */
async function resolveGroupId(groupId?: string): Promise<string> {
  if (groupId) return groupId;
  const groups = await taskService.listTaskGroups({ page: 1, pageSize: 50 });
  if (groups.items.length > 0) return groups.items[0].id;
  return (await taskService.createTaskGroup({ title: "默认" })).id;
}

export function buildAiTools(): ToolDefinition[] {
  return [
    defineTool({
      name: "list_task_groups",
      label: "List Task Groups",
      description: "列出全部任务分组",
      parameters: Type.Object({}),
      execute: (_id, _p, _s, _u, _c) =>
        run(() => taskService.listTaskGroups({ page: 1, pageSize: 50 })),
    }),
    defineTool({
      name: "create_task_group",
      label: "Create Task Group",
      description: "创建任务分组",
      parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 200 }) }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.createTaskGroup(p)),
    }),
    defineTool({
      name: "list_tasks",
      label: "List Tasks",
      description: "按可选条件列出任务（status: todo|done|abandon；dueDate 格式 YYYY-MM-DD）",
      parameters: Type.Object({
        groupId: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        dueDateFrom: Type.Optional(Type.String()),
        dueDateTo: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) =>
        run(() =>
          taskService.listTasks({
            page: 1,
            pageSize: 50,
            ...p,
          } as unknown as ListTaskInput),
        ),
    }),
    defineTool({
      name: "get_task",
      label: "Get Task",
      description: "按 id 获取任务详情",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.getTask(p)),
    }),
    defineTool({
      name: "create_task",
      label: "Create Task",
      description:
        "创建任务。groupId 可省略（自动落到首个分组或「默认」分组）；status: todo|done|abandon；dueDate 格式 YYYY-MM-DD",
      parameters: Type.Object({
        title: Type.String({ minLength: 1, maxLength: 200 }),
        groupId: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        dueDate: Type.Optional(Type.String()),
      }),
      // resolveGroupId 必须在 run() 内：无 DB 时列表查询抛错也要走统一的
      // 错误映射（throw → runner 标记 isError），而不是让 execute 绕过 run()
      // 直接裸 reject。
      execute: (_id, p, _s, _u, _c) =>
        run(async () => {
          const groupId = await resolveGroupId(p.groupId);
          return taskService.createTask({
            ...p,
            groupId,
          } as unknown as CreateTaskInput);
        }),
    }),
    defineTool({
      name: "update_task",
      label: "Update Task",
      description: "更新任务（title/groupId/status/dueDate，传哪些改哪些）",
      parameters: Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String()),
        groupId: Type.Optional(Type.String()),
        status: Type.Optional(Type.String()),
        dueDate: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) =>
        run(() => taskService.updateTask(p as unknown as UpdateTaskInput)),
    }),
    defineTool({
      name: "delete_task",
      label: "Delete Task",
      description: "按 id 删除任务",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => taskService.deleteTask(p)),
    }),
    defineTool({
      name: "list_events",
      label: "List Events",
      description: "按时间窗列出事件（from/to 为带时区偏移的 ISO 8601 时间）",
      parameters: Type.Object({
        from: Type.String(),
        to: Type.String(),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.list(p)),
    }),
    defineTool({
      name: "get_event",
      label: "Get Event",
      description: "按 id 获取事件详情",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.get(p)),
    }),
    defineTool({
      name: "create_event",
      label: "Create Event",
      description: "创建事件。startAt/endAt 为带时区偏移的 ISO 8601（如 2026-08-09T10:00:00+08:00）",
      parameters: Type.Object({
        title: Type.String({ minLength: 1, maxLength: 200 }),
        startAt: Type.String(),
        endAt: Type.String(),
        isAllDay: Type.Optional(Type.Boolean()),
        location: Type.Optional(Type.String()),
        note: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.create(p)),
    }),
    defineTool({
      name: "update_event",
      label: "Update Event",
      description: "更新事件（传哪些改哪些）",
      parameters: Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String()),
        startAt: Type.Optional(Type.String()),
        endAt: Type.Optional(Type.String()),
        isAllDay: Type.Optional(Type.Boolean()),
        location: Type.Optional(Type.String()),
        note: Type.Optional(Type.String()),
      }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.update(p)),
    }),
    defineTool({
      name: "delete_event",
      label: "Delete Event",
      description: "按 id 删除事件",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => eventService.delete(p)),
    }),
    defineTool({
      name: "list_moments",
      label: "List Moments",
      description: "列出最新闪念（前 20 条）",
      parameters: Type.Object({}),
      execute: (_id, _p, _s, _u, _c) =>
        run(() => momentService.list({ page: 1, pageSize: 20 })),
    }),
    defineTool({
      name: "get_moment",
      label: "Get Moment",
      description: "按 id 获取闪念详情",
      parameters: Type.Object({ id: Type.String() }),
      execute: (_id, p, _s, _u, _c) => run(() => momentService.get(p)),
    }),
    defineTool({
      name: "create_moment",
      label: "Create Moment",
      description: "创建闪念（纯文本）",
      parameters: Type.Object({ text: Type.String({ maxLength: 10000 }) }),
      execute: (_id, p, _s, _u, _c) => run(() => momentService.create(p)),
    }),
  ];
}
