import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { logger } from "@serenique/api";
import { createMcpServer } from "./server";

/** 常量时间比对，避免时序侧信道。 */
function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
        "Authorization",
      ],
      exposeHeaders: ["mcp-protocol-version", "mcp-session-id"],
      maxAge: 86400,
    }),
  );

  // 传输认证：与 API 共享同一 AUTH_TOKEN（在 createMcpApp 调用时捕获，测试逐例可控）。
  // 未配置 AUTH_TOKEN 时保持现状（内网）。放行 /health 与 /。
  const mcpAuthToken = process.env.AUTH_TOKEN;
  app.use("*", async (c, next) => {
    if (!mcpAuthToken) return next();
    if (c.req.path === "/health" || c.req.path === "/") return next();
    const header = c.req.header("Authorization");
    if (
      header &&
      header.startsWith("Bearer ") &&
      safeEqual(header.slice("Bearer ".length).trim(), mcpAuthToken)
    ) {
      return next();
    }
    return c.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "未认证或登录已过期" }, id: null },
      401,
    );
  });

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
