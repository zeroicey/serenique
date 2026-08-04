import type { Context } from "hono";
import { ZodError } from "zod";
import { diaryService } from "@/modules/diary/diary.service";
import {
  CreateDiarySchema,
  ListDiarySchema,
  UpdateDiaryBodySchema,
} from "@/modules/diary/diary.types";
import { Res } from "@/shared/response";
import { AppError, ErrorCode } from "@/shared/errors";
import { logger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Diary handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

function getId(c: Context): string {
  const id = c.req.param("id");
  if (!id) throw new AppError(ErrorCode.VALIDATION, "Missing id parameter", 400);
  return id;
}

function handleError(e: unknown, c: Context) {
  if (e instanceof AppError) {
    return Res.error(e.message).status(e.status).build(c);
  }
  if (e instanceof ZodError) {
    return Res.validationFailed("参数校验失败", e.issues).build(c);
  }
  logger.error({ err: e }, "Unhandled error in diary handler");
  return Res.internalError().build(c);
}

export const diaryHandler = {
  async create(c: Context) {
    try {
      const body = CreateDiarySchema.parse(await c.req.json());
      const result = await diaryService.create(body);
      return Res.created("日记创建成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async list(c: Context) {
    try {
      const query = ListDiarySchema.parse(c.req.query());
      const result = await diaryService.list(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async get(c: Context) {
    try {
      const result = await diaryService.get({ id: getId(c) });
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async update(c: Context) {
    try {
      const id = getId(c);
      const body = UpdateDiaryBodySchema.parse(await c.req.json());
      const result = await diaryService.update({ id, ...body });
      return Res.ok("日记更新成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  async delete(c: Context) {
    try {
      await diaryService.delete({ id: getId(c) });
      return Res.noContent("日记删除成功").build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },
};
