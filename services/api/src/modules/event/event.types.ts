import { z } from "zod";

// ---------------------------------------------------------------------------
// Event module — request/response types.
//
// startAt / endAt (and the list window from / to) are ISO 8601 datetime strings
// with a timezone offset (z.iso.datetime({ offset: true }) accepts Z or ±hh:mm,
// e.g. "2026-08-05T10:00:00+08:00" — the same surface time.Parse(RFC3339)
// accepts in the reference Go API). The service converts them to Date for
// storage; entries carry them back as ISO strings. The end > start rule is
// enforced in event.domain.ts (and by a DB CHECK), so the schemas stay plain
// objects and stay `.extend()`-able for MCP.
// ---------------------------------------------------------------------------

export const CreateEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  isAllDay: z.boolean().default(false),
  location: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export const UpdateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startAt: z.iso.datetime({ offset: true }).optional(),
    endAt: z.iso.datetime({ offset: true }).optional(),
    isAllDay: z.boolean().optional(),
    location: z.string().trim().optional(),
    note: z.string().trim().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.startAt !== undefined ||
      v.endAt !== undefined ||
      v.isAllDay !== undefined ||
      v.location !== undefined ||
      v.note !== undefined,
    "至少需要提供一个待更新字段",
  );

// List is a time-range query (no pagination), matching the reference API:
// ?from=<ISO>&to=<ISO> returns events overlapping [from, to).
export const ListEventSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

// ---- Input types (service layer) ------------------------------------------
// z.input keeps defaulted fields optional so MCP can pass bare objects.

export type CreateEventInput = z.input<typeof CreateEventSchema>;
export type UpdateEventInput = { id: string } & z.input<typeof UpdateEventSchema>;
export type ListEventInput = z.infer<typeof ListEventSchema>;
export type GetEventInput = { id: string };
export type DeleteEventInput = { id: string };

// ---- Entry types (response layer) — times are ISO strings -----------------

export type EventEntry = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  location: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};
