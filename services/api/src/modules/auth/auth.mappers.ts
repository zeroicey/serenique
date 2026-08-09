import type { passkeyCredentials, users } from "./auth.schema";
import type { CredentialEntry, UserEntry } from "./auth.types";

// ---------------------------------------------------------------------------
// Auth module — row → entry conversions (pure).
// ---------------------------------------------------------------------------

export function toUserEntry(row: typeof users.$inferSelect): UserEntry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    birthday: row.birthday,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCredentialEntry(
  row: typeof passkeyCredentials.$inferSelect,
): CredentialEntry {
  return {
    id: row.id,
    credentialId: row.credentialId,
    deviceLabel: row.deviceLabel,
    transports: row.transports,
    counter: row.counter,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
