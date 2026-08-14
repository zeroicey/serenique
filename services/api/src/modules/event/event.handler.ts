import type { Context } from 'hono'
import { eventService } from '@/modules/event/event.service'
import { CreateEventSchema, ListEventSchema, UpdateEventSchema } from '@/modules/event/event.types'
import { handleError, uuidParam } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Event handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

export const eventHandler = {
  async create(c: Context) {
    try {
      const body = CreateEventSchema.parse(await c.req.json())
      const result = await eventService.create(body)
      return Res.created('事件创建成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'event')
    }
  },

  async list(c: Context) {
    try {
      const query = ListEventSchema.parse(c.req.query())
      const result = await eventService.list(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'event')
    }
  },

  async get(c: Context) {
    try {
      const result = await eventService.get({ id: uuidParam(c, 'id') })
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'event')
    }
  },

  async update(c: Context) {
    try {
      const body = UpdateEventSchema.parse(await c.req.json())
      const result = await eventService.update({ id: uuidParam(c, 'id'), ...body })
      return Res.ok('事件更新成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'event')
    }
  },

  async delete(c: Context) {
    try {
      await eventService.delete({ id: uuidParam(c, 'id') })
      return Res.noContent('事件删除成功').build(c)
    } catch (e) {
      return handleError(e, c, 'event')
    }
  },
}
