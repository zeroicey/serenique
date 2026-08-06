import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  momentService,
  momentCommentService,
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

const ListMomentCommentsToolSchema = z.object({
  momentId: z.string().uuid().describe("闪念 ID (UUID)"),
});

const CreateMomentCommentToolSchema = z.object({
  momentId: z.string().uuid().describe("闪念 ID (UUID)"),
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("评论内容，最长 2000 字"),
});

const UpdateMomentCommentToolSchema = z.object({
  momentId: z.string().uuid().describe("闪念 ID (UUID)"),
  commentId: z.string().uuid().describe("评论 ID (UUID)"),
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("新的评论内容，最长 2000 字"),
});

const DeleteMomentCommentToolSchema = z.object({
  momentId: z.string().uuid().describe("闪念 ID (UUID)"),
  commentId: z.string().uuid().describe("评论 ID (UUID)"),
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

  server.registerTool(
    "list_moment_comments",
    {
      title: "List Moment Comments",
      description:
        "查询某条闪念的评论列表（对闪念的补充评论/回看备注），按创建时间正序排列。",
      inputSchema: ListMomentCommentsToolSchema,
    },
    async (input) => runTool(() => momentCommentService.list(input)),
  );

  server.registerTool(
    "create_moment_comment",
    {
      title: "Create Moment Comment",
      description:
        "给某条闪念添加一条补充评论/回看备注，内容最长 2000 字。",
      inputSchema: CreateMomentCommentToolSchema,
    },
    async (input) =>
      runTool(() =>
        momentCommentService.add(input.momentId, { content: input.content }),
      ),
  );

  server.registerTool(
    "update_moment_comment",
    {
      title: "Update Moment Comment",
      description:
        "更新某条闪念评论的内容（补充评论/回看备注），只能修改 content。",
      inputSchema: UpdateMomentCommentToolSchema,
    },
    async (input) =>
      runTool(() =>
        momentCommentService.update(
          { momentId: input.momentId, commentId: input.commentId },
          { content: input.content },
        ),
      ),
  );

  server.registerTool(
    "delete_moment_comment",
    {
      title: "Delete Moment Comment",
      description:
        "删除某条闪念的评论（补充评论/回看备注）。此操作不可撤销。",
      inputSchema: DeleteMomentCommentToolSchema,
    },
    async (input) =>
      runTool(() => momentCommentService.remove(input)),
  );
}
