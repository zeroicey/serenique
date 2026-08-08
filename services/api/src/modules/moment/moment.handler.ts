import type { Context } from "hono";
import { momentCommentService } from "@/modules/moment/comment.service";
import {
  CreateMomentCommentSchema,
  UpdateMomentCommentSchema,
} from "@/modules/moment/comment.types";
import { momentService } from "@/modules/moment/moment.service";
import {
  AddMomentAttachmentSchema,
  CreateMomentSchema,
  ListMomentSchema,
  UpdateMomentSchema,
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

  async update(c: Context) {
    try {
      const body = UpdateMomentSchema.parse(await c.req.json());
      const result = await momentService.update({
        id: uuidParam(c, "id"),
        ...body,
      });
      return Res.ok("闪念更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  // ---- Comment sub-resource handlers ----

  async listComments(c: Context) {
    try {
      const result = await momentCommentService.list({
        momentId: uuidParam(c, "id"),
      });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async addComment(c: Context) {
    try {
      const body = CreateMomentCommentSchema.parse(await c.req.json());
      const result = await momentCommentService.add(uuidParam(c, "id"), body);
      return Res.created("评论创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async updateComment(c: Context) {
    try {
      const body = UpdateMomentCommentSchema.parse(await c.req.json());
      const result = await momentCommentService.update(
        {
          momentId: uuidParam(c, "id"),
          commentId: uuidParam(c, "commentId"),
        },
        body,
      );
      return Res.ok("评论更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },

  async deleteComment(c: Context) {
    try {
      await momentCommentService.remove({
        momentId: uuidParam(c, "id"),
        commentId: uuidParam(c, "commentId"),
      });
      return Res.noContent("评论删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "moment");
    }
  },
};
