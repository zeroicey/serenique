import type { Context } from "hono";
import { z } from "zod";
import { momentService } from "@/modules/moment/moment.service";
import {
  AddMomentAttachmentSchema,
  CreateMomentSchema,
  ListMomentSchema,
} from "@/modules/moment/moment.types";
import { handleError } from "@/shared/handler";
import { Res } from "@/shared/response";
import { AppError } from "@/shared/errors";

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

export const momentHandler = {
  async create(c: Context) {
    try {
      const body = CreateMomentSchema.parse(await c.req.json());
      const result = await momentService.create(body);
      return Res.created("闪念创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async list(c: Context) {
    try {
      const query = ListMomentSchema.parse(c.req.query());
      const result = await momentService.list(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async get(c: Context) {
    try {
      const result = await momentService.get({ id: getId(c) });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async addAttachment(c: Context) {
    try {
      const body = AddMomentAttachmentSchema.parse(await c.req.json());
      const result = await momentService.addAttachment(getId(c), body);
      return Res.created("附件关联成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
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
      return handleError(e, c, "moment");
    }
  },

  async delete(c: Context) {
    try {
      const id = getId(c);
      await momentService.delete({ id });
      return Res.noContent("闪念删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },
};
