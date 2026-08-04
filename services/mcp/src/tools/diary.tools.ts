import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  diaryService,
  CreateDiarySchema,
  ListDiarySchema,
  UpdateDiaryBodySchema,
} from "@serenique/api";
import { runTool } from "./helpers";

// ---------------------------------------------------------------------------
// Diary MCP tools — wrap diary service operations for AI consumption.
// ---------------------------------------------------------------------------

const DiaryIdSchema = z.object({
  id: z.string().uuid().describe("日记 ID (UUID)"),
});

const CreateDiaryToolSchema = CreateDiarySchema.extend({
  content: CreateDiarySchema.shape.content.describe("日记内容"),
  diaryDate: CreateDiarySchema.shape.diaryDate.describe(
    "日期，格式 YYYY-MM-DD，可选，默认今天",
  ),
});

const ListDiaryToolSchema = ListDiarySchema.extend({
  page: ListDiarySchema.shape.page.describe("页码，从 1 开始，默认 1"),
  pageSize: ListDiarySchema.shape.pageSize.describe(
    "每页条数，默认 10，最大 50",
  ),
});

const UpdateDiaryToolSchema = UpdateDiaryBodySchema.extend({
  id: z.string().uuid().describe("日记 ID (UUID)"),
  content: UpdateDiaryBodySchema.shape.content.describe("新的日记内容"),
});

export function registerDiaryTools(server: McpServer) {
  server.registerTool(
    "create_diary",
    {
      title: "Create Diary",
      description:
        "创建一篇日记。可以指定日期 (YYYY-MM-DD)，不指定则使用今天。同一天只能有一篇日记。",
      inputSchema: CreateDiaryToolSchema,
    },
    async (input) => runTool(() => diaryService.create(input)),
  );

  server.registerTool(
    "list_diaries",
    {
      title: "List Diaries",
      description: "分页查询日记列表，返回日记摘要。",
      inputSchema: ListDiaryToolSchema,
    },
    async (input) => runTool(() => diaryService.list(input)),
  );

  server.registerTool(
    "get_diary",
    {
      title: "Get Diary",
      description: "根据 ID 获取单篇日记的完整内容。",
      inputSchema: DiaryIdSchema,
    },
    async (input) => runTool(() => diaryService.get(input)),
  );

  server.registerTool(
    "update_diary",
    {
      title: "Update Diary",
      description: "更新日记内容。只能修改 content，日期不可变更。",
      inputSchema: UpdateDiaryToolSchema,
    },
    async (input) => runTool(() => diaryService.update(input)),
  );

  server.registerTool(
    "delete_diary",
    {
      title: "Delete Diary",
      description: "删除一篇日记。此操作不可撤销。",
      inputSchema: DiaryIdSchema,
    },
    async (input) => runTool(() => diaryService.delete(input)),
  );
}
