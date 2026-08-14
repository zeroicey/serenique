import type { Context } from 'hono'
import { tagService } from '@/modules/tag/tag.service'
import {
  AttachTagSchema,
  CreateTagSchema,
  DetachTagSchema,
  ListTagSchema,
  RenameTagSchema,
} from '@/modules/tag/tag.types'
import { handleError, uuidParam } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Tag handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

export const tagHandler = {
  async listTags(c: Context) {
    try {
      const query = ListTagSchema.parse(c.req.query())
      const result = await tagService.list(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },

  async createTag(c: Context) {
    try {
      const body = CreateTagSchema.parse(await c.req.json())
      const result = await tagService.create(body)
      return Res.created('标签创建成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },

  async getTag(c: Context) {
    try {
      const result = await tagService.get({ id: uuidParam(c, 'id') })
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },

  async renameTag(c: Context) {
    try {
      const body = RenameTagSchema.parse(await c.req.json())
      const result = await tagService.rename({
        id: uuidParam(c, 'id'),
        ...body,
      })
      return Res.ok('标签更新成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },

  async deleteTag(c: Context) {
    try {
      await tagService.delete({ id: uuidParam(c, 'id') })
      return Res.noContent('标签删除成功').build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },

  async attachTag(c: Context) {
    try {
      const body = AttachTagSchema.parse(await c.req.json())
      const result = await tagService.attach({ tagId: uuidParam(c, 'id'), ...body })
      return Res.created('标签绑定成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },

  async detachTag(c: Context) {
    try {
      const body = DetachTagSchema.parse(await c.req.json())
      await tagService.detach({ tagId: uuidParam(c, 'id'), ...body })
      return Res.noContent('标签解绑成功').build(c)
    } catch (e) {
      return handleError(e, c, 'tag')
    }
  },
}
