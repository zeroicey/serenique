import { z } from "zod";

const transportSchema = z
  .enum(["stdio", "streamable-http", "sse"])
  .default("stdio");

const envSchema = z.object({
  MCP_TRANSPORT: transportSchema,
  PORT: z.coerce.number().int().positive().default(3001),
  SERENIQUE_API_BASE_URL: z.url().default("http://localhost:3000"),
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
