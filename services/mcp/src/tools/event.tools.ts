import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  eventService,
  CreateEventSchema,
  ListEventSchema,
  UpdateEventSchema,
} from "@serenique/api";
import { runTool } from "./helpers";

// ---------------------------------------------------------------------------
// Event MCP tools — wrap event service operations for AI consumption.
// Field contract follows the API source: title, startAt/endAt (ISO 8601 with a
// timezone offset), isAllDay, location, note. List is a time-range query
// (?from=&to=) returning a plain array — no pagination; it is wrapped in
// {items, total} at the MCP boundary to match every other list tool.
// ---------------------------------------------------------------------------

const EventIdSchema = z.object({
  id: z.string().uuid().describe("事件 ID (UUID)"),
});

const CreateEventToolSchema = CreateEventSchema.extend({
  title: CreateEventSchema.shape.title.describe("事件标题，最长 200 字"),
  startAt: CreateEventSchema.shape.startAt.describe(
    "开始时间（ISO 8601，需含时区偏移，如 2026-08-05T09:00:00+08:00）",
  ),
  endAt: CreateEventSchema.shape.endAt.describe(
    "结束时间（ISO 8601，需含时区偏移，必须晚于开始时间）",
  ),
  isAllDay: CreateEventSchema.shape.isAllDay.describe(
    "是否全天事件，可选，默认 false",
  ),
  location: CreateEventSchema.shape.location.describe("地点，可选"),
  note: CreateEventSchema.shape.note.describe("备注，可选"),
});

const ListEventToolSchema = ListEventSchema.extend({
  from: ListEventSchema.shape.from.describe(
    "查询窗口开始（ISO 8601，需含时区偏移，如 2026-08-05T00:00:00+08:00）",
  ),
  to: ListEventSchema.shape.to.describe(
    "查询窗口结束（ISO 8601，需含时区偏移，必须晚于 from）",
  ),
});

// UpdateEventSchema carries a refine ("至少需要提供一个待更新字段"), so it
// cannot be `.extend()`-ed (ZodEffects); rebuild it here with identical
// constraints.
const UpdateEventToolSchema = z
  .object({
    id: z.string().uuid().describe("事件 ID (UUID)"),
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("新的事件标题，可选"),
    startAt: z
      .iso.datetime({ offset: true })
      .optional()
      .describe("新的开始时间（ISO 8601，需含时区偏移），可选"),
    endAt: z
      .iso.datetime({ offset: true })
      .optional()
      .describe("新的结束时间（ISO 8601，需含时区偏移，必须晚于开始时间），可选"),
    isAllDay: z.boolean().optional().describe("是否全天事件，可选"),
    location: z.string().trim().optional().describe("新的地点，可选"),
    note: z.string().trim().optional().describe("新的备注，可选"),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.startAt !== undefined ||
      v.endAt !== undefined ||
      v.isAllDay !== undefined ||
      v.location !== undefined ||
      v.note !== undefined,
    "至少需要提供一个待更新字段",
  );

export function registerEventTools(server: McpServer) {
  server.registerTool(
    "create_event",
    {
      title: "Create Event",
      description:
        "创建一个日历事件。开始时间必须早于结束时间。可指定是否全天、地点与备注。",
      inputSchema: CreateEventToolSchema,
    },
    async (input) => runTool(() => eventService.create(input)),
  );

  server.registerTool(
    "list_events",
    {
      title: "List Events",
      description:
        "按时间窗口查询事件：返回与 [from, to) 重叠（开始或结束落在窗口内）的事件，按开始时间升序排列。无分页，一次返回窗口内全部事件。返回 {items, total}，与 list_diaries 等其他列表工具结构一致。",
      inputSchema: ListEventToolSchema,
    },
    async (input) =>
      runTool(async () => {
        // The HTTP/CLI contract for the event list is a bare array (no
        // pagination), but every other list tool returns {items, total} —
        // wrap here so AI/script consumers don't branch on the shape.
        const items = await eventService.list(input);
        return { items, total: items.length };
      }),
  );

  server.registerTool(
    "get_event",
    {
      title: "Get Event",
      description:
        "根据 ID 获取单个事件的完整信息，包括时间、是否全天、地点与备注。",
      inputSchema: EventIdSchema,
    },
    async (input) => runTool(() => eventService.get(input)),
  );

  server.registerTool(
    "update_event",
    {
      title: "Update Event",
      description:
        "部分更新事件：可修改标题、开始/结束时间、是否全天、地点或备注。只更新提供的字段；传入空字符串的地点/备注会清空该字段。至少需要提供一个待更新字段。",
      inputSchema: UpdateEventToolSchema,
    },
    async (input) => runTool(() => eventService.update(input)),
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete Event",
      description: "删除一个事件。此操作不可撤销。",
      inputSchema: EventIdSchema,
    },
    async (input) => runTool(() => eventService.delete(input)),
  );
}
