import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBlobTools } from "./tools/blob.tools";
import { registerMomentTools } from "./tools/moment.tools";
import { registerTaskTools } from "./tools/task.tools";
import { registerEventTools } from "./tools/event.tools";

export function createMcpServer() {
  const server = new McpServer({
    name: "serenique",
    version: "1.0.0",
  });

  registerMomentTools(server);
  registerBlobTools(server);
  registerTaskTools(server);
  registerEventTools(server);

  return server;
}
