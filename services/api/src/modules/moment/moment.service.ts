import { db } from "@/db/connection";
import { moments } from "@/modules/moment/moment.schema";
import { AppError, ErrorCode } from "@/shared/errors";
import type {
  CreateMomentInput,
  MomentEntry,
  ListMomentInput,
  DeleteMomentInput,
} from "@/modules/moment/moment.types";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Moment service — business logic and database operations.
// ---------------------------------------------------------------------------

function toEntry(row: typeof moments.$inferSelect): MomentEntry {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export const momentService = {
  async create(input: CreateMomentInput): Promise<MomentEntry> {
    const [row] = await db.insert(moments).values(input).returning();
    return toEntry(row);
  },

  async list(input: ListMomentInput): Promise<{ items: MomentEntry[]; total: number }> {
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ count }]] = await Promise.all([
      db.select().from(moments).orderBy(moments.createdAt).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(moments),
    ]);
    return { items: items.map(toEntry), total: count };
  },

  async delete(input: DeleteMomentInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(moments)
      .where(eq(moments.id, input.id))
      .returning({ id: moments.id });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "闪念不存在", 404);
    return row;
  },
};
