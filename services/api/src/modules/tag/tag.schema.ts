import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tag module — two tables: tags (independent resources) and tag_relations
// (polymorphic owner bindings, mirroring blob_attachments).
//
// - tags.name is unique + normalized (trim + lowercase) in the service layer;
//   the DB unique constraint is the last-line defense against races.
// - tag_relations.tag_id has ON DELETE CASCADE — deleting a tag removes all
//   its relations. Owner rows are NOT FK'd (polymorphic ownerType/ownerId),
//   so business modules must clean their relations explicitly on delete.
// - Unique (tag_id, owner_type, owner_id) keeps one tag bound to an owner
//   once; only the (owner_type, owner_id) index is created — the unique
//   constraint's leftmost prefix already covers tag_id lookups (decision ⑯).
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("idx_tags_updated_at_desc").on(t.updatedAt.desc())],
);

export const tagRelations = pgTable(
  "tag_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("tag_relations_tag_id_owner_type_owner_id_unique").on(
      t.tagId,
      t.ownerType,
      t.ownerId,
    ),
    index("tag_relations_owner_idx").on(t.ownerType, t.ownerId),
  ],
);
