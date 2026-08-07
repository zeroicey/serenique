import { and, asc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db/connection";
import { fireAuditRecord } from "@/modules/audit/audit.service";
import { events } from "@/modules/event/event.schema";
import {
  assertValidEventRange,
  assertValidListRange,
  resolveEventUpdate,
} from "@/modules/event/event.domain";
import { toEventEntry } from "@/modules/event/event.mappers";
import type {
  CreateEventInput,
  DeleteEventInput,
  EventEntry,
  GetEventInput,
  ListEventInput,
  UpdateEventInput,
} from "@/modules/event/event.types";
import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Event service — business orchestration over `db`.
//
// Time-range rules live in event.domain.ts (unit-testable without a DB); this
// file only wires them into queries. List returns a plain array — the time-range
// query is not paginated, matching the reference API's GET /events?from=&to=.
// ---------------------------------------------------------------------------

export const eventService = {
  async create(input: CreateEventInput): Promise<EventEntry> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    assertValidEventRange(startAt, endAt);

    const [row] = await db
      .insert(events)
      .values({
        title: input.title,
        startAt,
        endAt,
        isAllDay: input.isAllDay ?? false,
        location: input.location ?? null,
        note: input.note ?? null,
      })
      .returning();
    return toEventEntry(row);
  },

  async list(input: ListEventInput): Promise<EventEntry[]> {
    const from = new Date(input.from);
    const to = new Date(input.to);
    assertValidListRange(from, to);

    const rows = await db
      .select()
      .from(events)
      .where(and(lt(events.startAt, to), gt(events.endAt, from)))
      .orderBy(asc(events.startAt), asc(events.createdAt));
    return rows.map(toEventEntry);
  },

  async get(input: GetEventInput): Promise<EventEntry> {
    const [row] = await db.select().from(events).where(eq(events.id, input.id));
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "事件不存在", 404);
    return toEventEntry(row);
  },

  async update(input: UpdateEventInput): Promise<EventEntry> {
    const { id, ...patch } = input;

    const [current] = await db
      .select()
      .from(events)
      .where(eq(events.id, id));
    if (!current) throw new AppError(ErrorCode.NOT_FOUND, "事件不存在", 404);

    const resolved = resolveEventUpdate(current, {
      title: patch.title,
      startAt: patch.startAt !== undefined ? new Date(patch.startAt) : undefined,
      endAt: patch.endAt !== undefined ? new Date(patch.endAt) : undefined,
      isAllDay: patch.isAllDay,
      location: patch.location,
      note: patch.note,
    });

    const [row] = await db
      .update(events)
      .set({
        title: resolved.title,
        startAt: resolved.startAt,
        endAt: resolved.endAt,
        isAllDay: resolved.isAllDay,
        location: resolved.location,
        note: resolved.note,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "事件不存在", 404);
    return toEventEntry(row);
  },

  async delete(input: DeleteEventInput): Promise<{ id: string }> {
    const [row] = await db
      .delete(events)
      .where(eq(events.id, input.id))
      .returning({ id: events.id, title: events.title });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, "事件不存在", 404);
    fireAuditRecord({
      event: "event.delete",
      message: "事件已删除",
      level: "warn",
      detail: { id: row.id, title: row.title },
    });
    return { id: row.id };
  },
};
