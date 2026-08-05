import type { Context } from "hono";
import { diaryService } from "@/modules/diary/diary.service";
import {
  CreateDiarySchema,
  ListDiarySchema,
  UpdateDiaryBodySchema,
} from "@/modules/diary/diary.types";
import { handleError, uuidParam } from "@/shared/handler";
import { Res } from "@/shared/response";

// ---------------------------------------------------------------------------
// Diary handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

export const diaryHandler = {
  async create(c: Context) {
    try {
      const body = CreateDiarySchema.parse(await c.req.json());
      const result = await diaryService.create(body);
      return Res.created("日记创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "diary");
    }
  },

  async list(c: Context) {
    try {
      const query = ListDiarySchema.parse(c.req.query());
      const result = await diaryService.list(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "diary");
    }
  },

  async get(c: Context) {
    try {
      const result = await diaryService.get({ id: uuidParam(c, "id") });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "diary");
    }
  },

  async update(c: Context) {
    try {
      const id = uuidParam(c, "id");
      const body = UpdateDiaryBodySchema.parse(await c.req.json());
      const result = await diaryService.update({ id, ...body });
      return Res.ok("日记更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "diary");
    }
  },

  async delete(c: Context) {
    try {
      await diaryService.delete({ id: uuidParam(c, "id") });
      return Res.noContent("日记删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "diary");
    }
  },
};
