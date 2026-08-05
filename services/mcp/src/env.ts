import { z } from "zod";

const transportSchema = z
  .enum(["stdio", "streamable-http", "sse"])
  .default("stdio");

const envSchema = z.object({
  MCP_TRANSPORT: transportSchema,
  PORT: z.coerce.number().int().positive().default(3001),
  // How the MCP service reaches the API. In Docker this is the compose service
  // hostname (http://api:3000), which is only meaningful inside the network.
  SERENIQUE_API_BASE_URL: z.url().default("http://localhost:3000"),
  // Host-reachable base URL returned to users in upload guidance / curl
  // examples. When unset, falls back to SERENIQUE_API_BASE_URL. Set this in
  // Docker to the API's published address (e.g. http://localhost:3000) so the
  // curlExample an AI/user copies actually resolves on the host machine.
  SERENIQUE_PUBLIC_API_BASE_URL: z.url().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;
export type McpTransport = "stdio" | "streamable-http";

export const env = envSchema.parse(process.env);

export function normalizeTransport(transport: Env["MCP_TRANSPORT"]): McpTransport {
  return transport === "sse" ? "streamable-http" : transport;
}
