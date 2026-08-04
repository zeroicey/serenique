import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initBlobRoot, apiEnv, logger } from "@serenique/api";
import { createMcpApp } from "./app";
import { env, normalizeTransport } from "./env";
import { createMcpServer } from "./server";

// ---------------------------------------------------------------------------
// MCP Server entry point — supports two transports:
//   1. stdio           — local development (MCP_TRANSPORT=stdio, default)
//   2. streamable-http — Docker / remote access (MCP_TRANSPORT=streamable-http on PORT)
//
// The deprecated "sse" value is aliased to "streamable-http".
// ---------------------------------------------------------------------------

const transport = normalizeTransport(env.MCP_TRANSPORT);

// ---- Startup init ----------------------------------------------------------

const BLOB_ROOT = apiEnv.BLOB_ROOT;
if (!BLOB_ROOT) {
  logger.error("BLOB_ROOT 环境变量未设置");
  process.exit(1);
}

await initBlobRoot(BLOB_ROOT);

// ---- Create MCP server -----------------------------------------------------

if (transport === "stdio") {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Serenique MCP 服务已启动 (stdio)");
} else {
  const app = createMcpApp();
  Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });

  logger.info(
    { transport, port: env.PORT },
    "Serenique MCP 服务已启动",
  );
}
