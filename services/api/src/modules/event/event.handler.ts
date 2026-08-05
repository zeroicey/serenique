import type { Context } from "hono";
import { z } from "zod";
import { eventService } from "@/modules/event/event.service";
import {
  CreateEventSchema,
  ListEventSchema,
  UpdateEventSchema,
} from "@/modules/event/event.types";
import { handleError } from "@/shared/handler";
import { Res } from "@/shared/response";
import { AppError } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Event handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

const UuidParamSchema = z.string().uuid();

function getId(c: Context): string {
  const id = c.req.param("id");
  if (!id) throw new AppError("VALIDATION", "缺少 id 参数", 400);
  return UuidParamSchema.parse(id);
}

export const eventHandler = {
  async create(c: Context) {
    try {
      const body = CreateEventSchema.parse(await c.req.json());
      const result = await eventService.create(body);
      return Res.created("事件创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "event");
    }
  },

  async list(c: Context) {
    try {
      const query = ListEventSchema.parse(c.req.query());
      const result = await eventService.list(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "event");
    }
  },

  async get(c: Context) {
    try {
      const result = await eventService.get({ id: getId(c) });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "event");
    }
  },

  async update(c: Context) {
    try {
      const body = UpdateEventSchema.parse(await c.req.json());
      const result = await eventService.update({ id: getId(c), ...body });
      return Res.ok("事件更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "event");
    }
  },

  async delete(c: Context) {
    try {
      await eventService.delete({ id: getId(c) });
      return Res.noContent("事件删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "event");
    }
  },
};
