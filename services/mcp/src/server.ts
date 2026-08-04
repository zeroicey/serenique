import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBlobTools } from "./tools/blob.tools";
import { registerDiaryTools } from "./tools/diary.tools";
import { registerMomentTools } from "./tools/moment.tools";
import { registerTaskTools } from "./tools/task.tools";

export function createMcpServer() {
  const server = new McpServer({
    name: "serenique",
    version: "1.0.0",
  });

  registerDiaryTools(server);
  registerMomentTools(server);
  registerBlobTools(server);
  registerTaskTools(server);

  return server;
}
