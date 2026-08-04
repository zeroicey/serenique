import type { Context } from "hono";
import { z, ZodError } from "zod";
import { momentService } from "@/modules/moment/moment.service";
import {
  AddMomentAttachmentSchema,
  CreateMomentSchema,
  ListMomentSchema,
} from "@/modules/moment/moment.types";
import { Res } from "@/shared/response";
import { AppError } from "@/shared/errors";
import { logger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Moment handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

const UuidParamSchema = z.string().uuid();

function getId(c: Context): string {
  const id = c.req.param("id");
  if (!id) throw new AppError("VALIDATION", "缺少 id 参数", 400);
  return UuidParamSchema.parse(id);
}

function getAttachmentId(c: Context): string {
  const id = c.req.param("attachmentId");
  if (!id) throw new AppError("VALIDATION", "缺少 attachmentId 参数", 400);
  return UuidParamSchema.parse(id);
}

function handleError(e: unknown, c: Context) {
  if (e instanceof AppError) {
    return Res.error(e.message).status(e.status).build(c);
  }
  if (e instanceof ZodError) {
    return Res.validationFailed("参数校验失败", e.issues).build(c);
  }
  logger.error({ err: e }, "Unhandled error in moment handler");
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

  async get(c: Context) {
    try {
      const result = await momentService.get({ id: getId(c) });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async addAttachment(c: Context) {
    try {
      const body = AddMomentAttachmentSchema.parse(await c.req.json());
      const result = await momentService.addAttachment(getId(c), body);
      return Res.created("附件关联成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async deleteAttachment(c: Context) {
    try {
      await momentService.deleteAttachment({
        momentId: getId(c),
        attachmentId: getAttachmentId(c),
      });
      return Res.noContent("附件关联已删除").build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async delete(c: Context) {
    try {
      const id = getId(c);
      await momentService.delete({ id });
      return Res.noContent("闪念删除成功").build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },
};
