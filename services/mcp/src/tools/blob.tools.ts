import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { blobService, ListBlobSchema } from "@serenique/api";
import { runTool } from "./helpers";
import { env } from "../env";

// ---------------------------------------------------------------------------
// Blob MCP tools — wrap blob metadata operations for AI consumption.
// ---------------------------------------------------------------------------

const BlobIdSchema = z.object({
  id: z.string().uuid().describe("文件 ID (UUID)"),
});

const ListBlobToolSchema = ListBlobSchema.extend({
  page: ListBlobSchema.shape.page.describe("页码，从 1 开始，默认 1"),
  pageSize: ListBlobSchema.shape.pageSize.describe(
    "每页条数，默认 20，最大 50",
  ),
  mimeType: ListBlobSchema.shape.mimeType.describe(
    "MIME 类型前缀过滤，如 image/、application/pdf，可选",
  ),
});

const UploadBlobToolSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe(
      "调用方本机上的文件路径，仅用于生成 HTTP 上传示例；MCP 服务不会读取这个路径。",
    ),
});

/**
 * Build the upload endpoint URL for user-facing guidance. Prefer the
 * host-reachable public base URL when configured: in Docker
 * SERENIQUE_API_BASE_URL is the compose-service hostname (http://api:3000),
 * which an agent on the host cannot resolve. Fall back to the API base URL so
 * single-host setups keep working unchanged. Pure — unit-testable without env.
 */
export function buildUploadEndpoint(
  apiBaseUrl: string,
  publicBaseUrl?: string,
): string {
  const base = (publicBaseUrl ?? apiBaseUrl).replace(/\/+$/, "");
  return `${base}/api/blobs/upload`;
}

function uploadEndpoint() {
  return buildUploadEndpoint(
    env.SERENIQUE_API_BASE_URL,
    env.SERENIQUE_PUBLIC_API_BASE_URL,
  );
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function uploadInstructions(input: z.infer<typeof UploadBlobToolSchema>) {
  const endpoint = uploadEndpoint();
  const filePath = input.filePath ?? "/absolute/path/to/file";

  return {
    directMcpUploadSupported: false,
    reason:
      "MCP tool 参数是 JSON，本服务不通过 MCP 接收 multipart/binary 文件；请由能访问文件的客户端直接请求 HTTP 上传接口。",
    uploadEndpoint: endpoint,
    method: "POST",
    contentType: "multipart/form-data",
    fileField: "file",
    curlExample: `curl -X POST -F ${shellSingleQuote(`file=@"${filePath}"`)} ${shellSingleQuote(endpoint)}`,
    responseData:
      "上传成功后，HTTP 响应的 data 字段是 BlobEntry，其中 data.id 可继续传给 get_blob 或用于业务记录关联。",
    followUpTools: ["list_blobs", "get_blob", "delete_blob"],
  };
}

export function registerBlobTools(server: McpServer) {
  server.registerTool(
    "upload_blob",
    {
      title: "Upload Blob",
      description:
        "获取文件上传指引。此 MCP tool 不直接接收文件内容，而是返回 Serenique HTTP multipart 上传接口、字段名和调用示例，供能访问文件的客户端执行上传。",
      inputSchema: UploadBlobToolSchema,
    },
    async (input) => runTool(async () => uploadInstructions(input)),
  );

  server.registerTool(
    "list_blobs",
    {
      title: "List Blobs",
      description:
        "分页查询已上传的文件列表。可按 MIME 类型过滤（如 image/，application/pdf）。如需上传文件，先调用 upload_blob 获取 HTTP 上传接口说明。",
      inputSchema: ListBlobToolSchema,
    },
    async (input) => runTool(() => blobService.list(input)),
  );

  server.registerTool(
    "get_blob",
    {
      title: "Get Blob",
      description:
        "获取单个文件的元数据：文件名、MIME 类型、大小、图片尺寸 (如有)、校验和、上传时间。",
      inputSchema: BlobIdSchema,
    },
    async (input) => runTool(() => blobService.get(input.id)),
  );

  server.registerTool(
    "delete_blob",
    {
      title: "Delete Blob",
      description:
        "删除一个文件（同时删除数据库记录和磁盘文件）。此操作不可撤销。",
      inputSchema: BlobIdSchema,
    },
    async (input) =>
      runTool(async () => {
        await blobService.delete(input.id);
        return { deleted: input.id };
      }),
  );
}
