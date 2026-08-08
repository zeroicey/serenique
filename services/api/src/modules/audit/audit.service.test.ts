import { describe, expect, test } from "bun:test";
import { setTestEnv } from "@/test/helpers";

// ---------------------------------------------------------------------------
// Audit module unit tests — Zod schemas (record / list / read) and the
// row→entry mapper. No database needed.
// ---------------------------------------------------------------------------

describe("RecordAuditSchema", () => {
  test("accepts a minimal record and defaults level to info", async () => {
    setTestEnv();
    const { RecordAuditSchema } = await import("./audit.types");
    const parsed = RecordAuditSchema.parse({
      event: "moment.delete",
      message: "闪念已删除",
    });
    expect(parsed).toEqual({ event: "moment.delete", message: "闪念已删除", level: "info" });
  });

  test("accepts the full payload (source / ip / detail)", async () => {
    setTestEnv();
    const { RecordAuditSchema } = await import("./audit.types");
    const parsed = RecordAuditSchema.parse({
      event: "auth.login",
      message: "登录成功",
      level: "info",
      source: "web",
      ip: "203.0.113.5",
      detail: { userId: "u1" },
    });
    expect(parsed).toMatchObject({
      event: "auth.login",
      level: "info",
      source: "web",
      ip: "203.0.113.5",
      detail: { userId: "u1" },
    });
  });

  test("rejects unknown events and bad levels", async () => {
    setTestEnv();
    const { RecordAuditSchema } = await import("./audit.types");
    expect(() =>
      RecordAuditSchema.parse({ event: "auth.hack", message: "x" }),
    ).toThrow();
    expect(() =>
      RecordAuditSchema.parse({ event: "auth.login", message: "x", level: "debug" }),
    ).toThrow();
  });

  test("requires a non-empty message", async () => {
    setTestEnv();
    const { RecordAuditSchema } = await import("./audit.types");
    expect(() => RecordAuditSchema.parse({ event: "auth.login", message: "" })).toThrow();
  });
});

describe("ListAuditSchema", () => {
  test("defaults page/pageSize and leaves filters optional", async () => {
    setTestEnv();
    const { ListAuditSchema } = await import("./audit.types");
    const parsed = ListAuditSchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 10 });
  });

  test("unreadOnly parses true/false distinctly", async () => {
    setTestEnv();
    const { ListAuditSchema } = await import("./audit.types");
    expect(ListAuditSchema.parse({ unreadOnly: "true" }).unreadOnly).toBe(true);
    expect(ListAuditSchema.parse({ unreadOnly: "false" }).unreadOnly).toBe(false);
    expect(ListAuditSchema.parse({}).unreadOnly).toBeUndefined();
  });

  test("pageSize caps at 50; bad level/event rejected", async () => {
    setTestEnv();
    const { ListAuditSchema } = await import("./audit.types");
    expect(() => ListAuditSchema.parse({ pageSize: 51 })).toThrow();
    expect(() => ListAuditSchema.parse({ level: "verbose" })).toThrow();
    expect(() => ListAuditSchema.parse({ event: "nope.nope" })).toThrow();
  });
});

describe("MarkReadSchema", () => {
  test("accepts absent ids (mark all) and an ids array", async () => {
    setTestEnv();
    const { MarkReadSchema } = await import("./audit.types");
    expect(MarkReadSchema.parse({}).ids).toBeUndefined();
    expect(MarkReadSchema.parse({ ids: [] }).ids).toEqual([]);
    const id = "0198f6d0-9e7c-71d7-8214-2a0f7f5f9999";
    expect(MarkReadSchema.parse({ ids: [id] }).ids).toEqual([id]);
  });

  test("rejects >500 ids and non-uuid ids", async () => {
    setTestEnv();
    const { MarkReadSchema } = await import("./audit.types");
    const id = "0198f6d0-9e7c-71d7-8214-2a0f7f5f9999";
    expect(() => MarkReadSchema.parse({ ids: Array(501).fill(id) })).toThrow();
    expect(() => MarkReadSchema.parse({ ids: ["not-a-uuid"] })).toThrow();
  });
});

describe("toAuditLogEntry mapper", () => {
  test("maps a row to the public entry (ISO createdAt, nullable fields)", async () => {
    setTestEnv();
    const { toAuditLogEntry } = await import("./audit.mappers");
    const entry = toAuditLogEntry({
      id: "0198f6d0-9e7c-71d7-8214-2a0f7f5f9999",
      event: "auth.login",
      message: "登录成功",
      level: "info",
      source: null,
      ip: "203.0.113.5",
      detail: null,
      isRead: false,
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
    });
    expect(entry).toEqual({
      id: "0198f6d0-9e7c-71d7-8214-2a0f7f5f9999",
      event: "auth.login",
      message: "登录成功",
      level: "info",
      source: null,
      ip: "203.0.113.5",
      detail: null,
      isRead: false,
      createdAt: "2026-08-08T10:00:00.000Z",
    });
  });
});
