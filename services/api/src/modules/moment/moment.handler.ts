import type { Context } from "hono";
import { momentService } from "@/modules/moment/moment.service";
import {
  AddMomentAttachmentSchema,
  CreateMomentSchema,
  ListMomentSchema,
} from "@/modules/moment/moment.types";
import { handleError, uuidParam } from "@/shared/handler";
import { Res } from "@/shared/response";

// ---------------------------------------------------------------------------
// Moment handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

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
      const result = await momentService.get({ id: uuidParam(c, "id") });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async addAttachment(c: Context) {
    try {
      const body = AddMomentAttachmentSchema.parse(await c.req.json());
      const result = await momentService.addAttachment(uuidParam(c, "id"), body);
      return Res.created("附件关联成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async deleteAttachment(c: Context) {
    try {
      await momentService.deleteAttachment({
        momentId: uuidParam(c, "id"),
        attachmentId: uuidParam(c, "attachmentId"),
      });
      return Res.noContent("附件关联已删除").build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async delete(c: Context) {
    try {
      const id = uuidParam(c, "id");
      await momentService.delete({ id });
      return Res.noContent("闪念删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },
};
