import type { apiTokens } from "./token.schema";
import type { TokenEntry } from "./token.types";

// ---------------------------------------------------------------------------
// Tokens module — row → entry conversion (pure).
// ---------------------------------------------------------------------------

export function toTokenEntry(row: typeof apiTokens.$inferSelect): TokenEntry {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
