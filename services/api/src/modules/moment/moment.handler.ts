import type { Context } from "hono";
import { ZodError } from "zod";
import { momentService } from "@/modules/moment/moment.service";
import {
  CreateMomentSchema,
  ListMomentSchema,
} from "@/modules/moment/moment.types";
import { Res } from "@/shared/response";
import { AppError } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Moment handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

function handleError(e: unknown, c: Context) {
  if (e instanceof AppError) {
    return Res.error(e.message).status(e.status).build(c);
  }
  if (e instanceof ZodError) {
    return Res.validationFailed("参数校验失败", e.issues).build(c);
  }
  console.error(e);
  return Res.internalError().build(c);
}

export const momentHandler = {
  async create(c: Context) {
    try {
      const body = CreateMomentSchema.parse(await c.req.json());
      const result = await momentService.create(body);
      return Res.created("闪念创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async list(c: Context) {
    try {
      const query = ListMomentSchema.parse(c.req.query());
      const result = await momentService.list(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async delete(c: Context) {
    try {
      const id = c.req.param("id");
      if (!id) {
        return Res.validationFailed("缺少 id 参数").build(c);
      }
      await momentService.delete({ id });
      return Res.noContent("闪念删除成功").build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },
};
