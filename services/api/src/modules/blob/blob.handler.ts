import type { Context } from 'hono'
import { blobService } from '@/modules/blob/blob.service'
import {
  ConfirmUploadSchema,
  CreateBlobAccessLinkSchema,
  CreateBlobAttachmentSchema,
  CreateUploadUrlSchema,
  ListBlobSchema,
} from '@/modules/blob/blob.types'
import { handleError, uuidParam } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseBlobRange(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return null

  const [, startText, endText] = match
  if (!startText && !endText) return null

  if (!startText) {
    const suffixLength = Number(endText)
    if (!Number.isInteger(suffixLength) || suffixLength <= 0 || size <= 0) {
      return null
    }
    const start = Math.max(size - suffixLength, 0)
    return { start, end: size - 1 }
  }

  const start = Number(startText)
  const end = endText ? Number(endText) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < 0 || end < start || start >= size) return null

  return { start, end: Math.min(end, size - 1) }
}

function fileHeaders(
  mimeType: string,
  filename: string,
  disposition: 'inline' | 'attachment',
  contentLength: number,
) {
  return {
    'Content-Type': mimeType,
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
    'Content-Length': contentLength.toString(),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const blobHandler = {
  /** POST /api/blobs/upload — multipart file upload */
  async upload(c: Context) {
    try {
      let body: Record<string, unknown>
      try {
        body = await c.req.parseBody()
      } catch {
        return Res.badRequest('无法解析上传内容，请使用 multipart/form-data').build(c)
      }

      const file = body.file
      if (!file || !(file instanceof File)) {
        return Res.badRequest('请上传文件（字段名 file）').build(c)
      }

      // Reject empty files
      if (file.size === 0) {
        return Res.badRequest('文件不能为空').build(c)
      }

      const result = await blobService.upload(file)
      return Res.ok('上传成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** GET /api/blobs — paginated list */
  async list(c: Context) {
    try {
      const query = ListBlobSchema.parse(c.req.query())
      const result = await blobService.list(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** GET /api/blobs/:id — blob metadata */
  async get(c: Context) {
    try {
      const result = await blobService.get(uuidParam(c, 'id'))
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** GET /api/blobs/:id/file — download / inline preview */
  async getFile(c: Context) {
    try {
      const id = uuidParam(c, 'id')
      const expires = c.req.query('expires')
      const signature = c.req.query('signature')
      if (expires || signature) {
        blobService.verifyAccessSignature(id, { expires, signature })
      }

      const { body, mimeType, filename, size } = await blobService.getFile(id)
      const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline'
      const rangeHeader = c.req.header('range')
      const range = parseBlobRange(rangeHeader, size)

      if (rangeHeader && !range) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${size}`,
            'Accept-Ranges': 'bytes',
          },
        })
      }

      if (range) {
        const contentLength = range.end - range.start + 1
        return new Response(body.slice(range.start, range.end + 1), {
          status: 206,
          headers: {
            ...fileHeaders(mimeType, filename, disposition, contentLength),
            'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          },
        })
      }

      return new Response(body, {
        status: 200,
        headers: fileHeaders(mimeType, filename, disposition, size),
      })
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** POST /api/blobs/upload-url — r2 直传：签发 PUT 直传 URL */
  async createUploadUrl(c: Context) {
    try {
      const body = CreateUploadUrlSchema.parse(await c.req.json())
      const result = await blobService.createUploadUrl(body)
      return Res.ok('直传凭据已签发', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** POST /api/blobs/confirm — 直传完成确认（去重 + 落库） */
  async confirmUpload(c: Context) {
    try {
      const body = ConfirmUploadSchema.parse(await c.req.json())
      const result = await blobService.confirmUpload(body)
      return Res.ok('上传成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** POST /api/blobs/:id/access-link — create a temporary signed access link */
  async createAccessLink(c: Context) {
    try {
      const raw = await c.req.json().catch(() => ({}))
      const body = CreateBlobAccessLinkSchema.parse(raw)
      const requestUrl = new URL(c.req.url)
      const result = await blobService.createAccessLink(uuidParam(c, 'id'), {
        ...body,
        baseUrl: requestUrl.origin,
      })
      return Res.ok('生成成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** DELETE /api/blobs/:id */
  async delete(c: Context) {
    try {
      await blobService.delete(uuidParam(c, 'id'))
      return Res.noContent('文件删除成功').build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** POST /api/blobs/:id/attachments — create a business reference */
  async createAttachment(c: Context) {
    try {
      const body = CreateBlobAttachmentSchema.parse(await c.req.json())
      const result = await blobService.createAttachment(uuidParam(c, 'id'), body)
      return Res.created('关联成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** GET /api/blobs/:id/attachments — list references for a blob */
  async listAttachments(c: Context) {
    try {
      const result = await blobService.listAttachments(uuidParam(c, 'id'))
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** DELETE /api/blob-attachments/:id — remove a reference only */
  async deleteAttachment(c: Context) {
    try {
      await blobService.deleteAttachment(uuidParam(c, 'id'))
      return Res.noContent('附件关联已删除').build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },

  /** POST /api/blobs/cleanup-orphans — delete unreferenced disk files */
  async cleanupOrphans(c: Context) {
    try {
      const result = await blobService.cleanupOrphanFiles()
      return Res.ok('清理完成', result).build(c)
    } catch (e) {
      return handleError(e, c, 'blob')
    }
  },
}
