import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  momentService,
  CreateMomentSchema,
  ListMomentSchema,
} from "@serenique/api";
import { runTool } from "./helpers";

// ---------------------------------------------------------------------------
// Moment MCP tools — wrap moment service operations for AI consumption.
// ---------------------------------------------------------------------------

const MomentIdSchema = z.object({
  id: z.string().uuid().describe("闪念 ID (UUID)"),
});

const CreateMomentToolSchema = CreateMomentSchema.extend({
  text: CreateMomentSchema.shape.text.describe("闪念内容，最长 500 字"),
});

const ListMomentToolSchema = ListMomentSchema.extend({
  page: ListMomentSchema.shape.page.describe("页码，从 1 开始，默认 1"),
  pageSize: ListMomentSchema.shape.pageSize.describe(
    "每页条数，默认 10，最大 50",
  ),
});

export function registerMomentTools(server: McpServer) {
  server.registerTool(
    "create_moment",
    {
      title: "Create Moment",
    description:
      "创建一条闪念笔记 (moment)。用于记录临时的想法、灵感、备忘，内容最长 500 字。",
      inputSchema: CreateMomentToolSchema,
    },
    async (input) => runTool(() => momentService.create(input)),
  );

  server.registerTool(
    "list_moments",
    {
      title: "List Moments",
      description: "分页查询闪念列表，按创建时间排序。",
      inputSchema: ListMomentToolSchema,
    },
    async (input) => runTool(() => momentService.list(input)),
  );

  server.registerTool(
    "delete_moment",
    {
      title: "Delete Moment",
      description: "删除一条闪念。此操作不可撤销。",
      inputSchema: MomentIdSchema,
    },
    async (input) => runTool(() => momentService.delete(input)),
  );
}
