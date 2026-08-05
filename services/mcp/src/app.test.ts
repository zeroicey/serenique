import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function setTestEnv() {
  process.env.DATABASE_URL ??=
    "postgresql://serenique:serenique@127.0.0.1:5432/serenique";
  process.env.BLOB_ROOT ??= "/tmp/serenique-mcp-test";
  process.env.BLOB_MAX_SIZE ??= "104857600";
  process.env.SERENIQUE_API_BASE_URL ??= "http://localhost:3000";
  process.env.NODE_ENV ??= "test";
}

function createAppFetch(app: {
  fetch: (request: Request) => Response | Promise<Response>;
}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return app.fetch(request);
  };
}

describe("createMcpApp", () => {
  test("serves a health route", async () => {
    setTestEnv();
    const { createMcpApp } = await import("./app");
    const app = createMcpApp({ enableJsonResponse: true });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      transport: "streamable-http",
    });
  });

  test("exposes tools through the Streamable HTTP MCP client", async () => {
    setTestEnv();
    const { createMcpApp } = await import("./app");
    const app = createMcpApp({ enableJsonResponse: true });
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      { fetch: createAppFetch(app) },
    );
    const client = new Client({ name: "serenique-test", version: "1.0.0" });

    await client.connect(transport);
    const tools = await client.listTools();
    await client.close();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "create_diary",
      "create_event",
      "create_moment",
      "create_task",
      "create_task_group",
      "delete_blob",
      "delete_diary",
      "delete_event",
      "delete_moment",
      "delete_task",
      "delete_task_group",
      "get_blob",
      "get_diary",
      "get_diary_by_date",
      "get_event",
      "get_task",
      "get_task_group",
      "list_blobs",
      "list_diaries",
      "list_events",
      "list_moments",
      "list_task_groups",
      "list_tasks",
      "update_diary",
      "update_event",
      "update_task",
      "update_task_group",
      "upload_blob",
    ]);
  });

  test("upload_blob returns HTTP upload instructions", async () => {
    setTestEnv();
    const { createMcpApp } = await import("./app");
    const app = createMcpApp({ enableJsonResponse: true });
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      { fetch: createAppFetch(app) },
    );
    const client = new Client({ name: "serenique-test", version: "1.0.0" });

    await client.connect(transport);
    const result = await client.callTool({
      name: "upload_blob",
      arguments: { filePath: "/tmp/example.png" },
    });
    await client.close();

    expect(result.isError).not.toBe(true);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(content.type).toBe("text");

    const payload = JSON.parse(content.text);
    expect(payload).toMatchObject({
      directMcpUploadSupported: false,
      method: "POST",
      contentType: "multipart/form-data",
      fileField: "file",
      uploadEndpoint: "http://localhost:3000/api/blobs/upload",
    });
    expect(payload.curlExample).toContain('file=@"/tmp/example.png"');
  });
});
