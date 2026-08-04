import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodError } from "zod";
import { AppError } from "@serenique/api";
import { logger } from "@serenique/api";

// ---------------------------------------------------------------------------
// Shared MCP tool helpers — error formatting, response building.
// ---------------------------------------------------------------------------

/** Convert application errors to user-friendly MCP error text. */
export function formatError(e: unknown): string {
  if (e instanceof AppError) {
    return `[${e.code}] ${e.message}`;
  }
  if (isZodError(e)) {
    const issues = e.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    return `参数校验失败:\n${issues}`;
  }
  logger.error({ err: e }, "MCP tool 未预期的错误");
  return `内部错误: ${e instanceof Error ? e.message : String(e)}`;
}

function isZodError(e: unknown): e is ZodError {
  return (
    typeof e === "object" &&
    e !== null &&
    "issues" in e &&
    Array.isArray((e as ZodError).issues)
  );
}

/** Format a JSON-serializable value as a text MCP result. */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Return an error result that the AI can read. */
export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export async function runTool<T>(operation: () => Promise<T>): Promise<CallToolResult> {
  try {
    const result = await operation();
    return jsonResult(result);
  } catch (e) {
    return errorResult(formatError(e));
  }
}
