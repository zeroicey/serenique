import type { Context } from "hono";
import { ZodError } from "zod";
import { blobService } from "@/modules/blob/blob.service";
import { ListBlobSchema } from "@/modules/blob/blob.types";
import { Res } from "@/shared/response";
import { AppError } from "@/shared/errors";
import { logger } from "@/shared/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getId(c: Context): string {
  const id = c.req.param("id");
  if (!id) throw new AppError("VALIDATION", "缺少 id 参数", 400);
  return id;
}

function handleError(e: unknown, c: Context) {
  if (e instanceof AppError) {
    return Res.error(e.message).status(e.status).build(c);
  }
  if (e instanceof ZodError) {
    return Res.validationFailed("参数校验失败", e.issues).build(c);
  }
  logger.error({ err: e }, "Unhandled error in blob handler");
  return Res.internalError().build(c);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const blobHandler = {
  /** POST /api/blobs/upload — multipart file upload */
  async upload(c: Context) {
    try {
      let body: Record<string, unknown>;
      try {
        body = await c.req.parseBody();
      } catch {
        return Res.badRequest("无法解析上传内容，请使用 multipart/form-data").build(c);
      }

      const file = body.file;
      if (!file || !(file instanceof File)) {
        return Res.badRequest("请上传文件（字段名 file）").build(c);
      }

      // Reject empty files
      if (file.size === 0) {
        return Res.badRequest("文件不能为空").build(c);
      }

      const result = await blobService.upload(file);
      return Res.ok("上传成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  /** GET /api/blobs — paginated list */
  async list(c: Context) {
    try {
      const query = ListBlobSchema.parse(c.req.query());
      const result = await blobService.list(query);
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  /** GET /api/blobs/:id — blob metadata */
  async get(c: Context) {
    try {
      const result = await blobService.get(getId(c));
      return Res.ok("查询成功", result).build(c);
    } catch (e) {
      return handleError(e, c);
    }
  },

  /** GET /api/blobs/:id/file — download / inline preview */
  async getFile(c: Context) {
    try {
      const { buf, mimeType, filename } = await blobService.getFile(getId(c));
      const body = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;

      const disposition =
        c.req.query("download") === "1" ? "attachment" : "inline";

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `${disposition}; filename="${encodeURIComponent(filename)}"`,
          "Content-Length": buf.length.toString(),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (e) {
      return handleError(e, c);
    }
  },

  /** DELETE /api/blobs/:id */
  async delete(c: Context) {
    try {
      await blobService.delete(getId(c));
      return c.body(null, 204);
    } catch (e) {
      return handleError(e, c);
    }
  },
};
