import type { tagRelations, tags } from "@/modules/tag/tag.schema";
import type { TagEntry, TagRelationEntry } from "@/modules/tag/tag.types";

// ---------------------------------------------------------------------------
// Tag mappers — row → entry conversion and owner grouping. Pure functions,
// no DB / IO.
// ---------------------------------------------------------------------------

export type TagJoinRow = {
  relation: typeof tagRelations.$inferSelect;
  tag: typeof tags.$inferSelect;
};

export function toTagEntry(
  row: typeof tags.$inferSelect,
  momentCount = 0,
): TagEntry {
  return {
    id: row.id,
    name: row.name,
    momentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTagRelationEntry(
  row: typeof tagRelations.$inferSelect,
): TagRelationEntry {
  return {
    id: row.id,
    tagId: row.tagId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Group join rows by owner id, mapping each to a TagEntry. `momentCounts`
 * (tagId → bound-moment count) is optional — entries default to 0 when absent.
 */
export function groupTagEntriesByOwnerId(
  rows: TagJoinRow[],
  momentCounts: ReadonlyMap<string, number> = new Map(),
): Map<string, TagEntry[]> {
  const grouped = new Map<string, TagEntry[]>();

  for (const row of rows) {
    const ownerId = row.relation.ownerId;
    const group = grouped.get(ownerId) ?? [];
    group.push(toTagEntry(row.tag, momentCounts.get(row.tag.id) ?? 0));
    grouped.set(ownerId, group);
  }

  return grouped;
}
