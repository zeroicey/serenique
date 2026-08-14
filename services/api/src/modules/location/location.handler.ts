import type { Context } from 'hono'
import { locationService } from '@/modules/location/location.service'
import { NearbyQuerySchema, SearchQuerySchema } from '@/modules/location/location.types'
import { handleError } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Location handlers — parse query → call service → build response.
// ---------------------------------------------------------------------------

export const locationHandler = {
  async config(c: Context) {
    try {
      return Res.ok('查询成功', locationService.config()).build(c)
    } catch (e) {
      return handleError(e, c, 'location')
    }
  },

  async nearby(c: Context) {
    try {
      const query = NearbyQuerySchema.parse(c.req.query())
      const result = await locationService.nearby(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'location')
    }
  },

  async search(c: Context) {
    try {
      const query = SearchQuerySchema.parse(c.req.query())
      const result = await locationService.search(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'location')
    }
  },
}
