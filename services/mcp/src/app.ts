import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { logger } from "@serenique/api";
import { createMcpServer } from "./server";

export type CreateMcpAppOptions = {
  enableJsonResponse?: boolean;
};

export function createMcpApp(options: CreateMcpAppOptions = {}) {
  const app = new Hono();

  app.onError((err, c) => {
    logger.error({ err, method: c.req.method, path: c.req.path }, "Unhandled MCP app error");
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
      500,
    );
  });

  app.use(
    "*",
    cors({
      origin: process.env.CORS_ORIGIN ?? "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Last-Event-ID",
        "mcp-protocol-version",
        "mcp-session-id",
      ],
      exposeHeaders: ["mcp-protocol-version", "mcp-session-id"],
      maxAge: 86400,
    }),
  );

  app.get("/health", (c) =>
    c.json({ status: "ok", transport: "streamable-http" }),
  );

  app.get("/", (c) =>
    c.json({
      name: "Serenique MCP",
      transport: "streamable-http",
      endpoints: ["/health", "/mcp"],
    }),
  );

  app.all("/mcp", async (c) => {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: options.enableJsonResponse,
    });

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.notFound((c) => c.text("Not Found", 404));

  return app;
}
