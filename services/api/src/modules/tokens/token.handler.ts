import type { Context } from 'hono'
import { tokenService } from '@/modules/tokens/token.service'
import { CreateTokenSchema } from '@/modules/tokens/token.types'
import { handleError, uuidParam } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Tokens handlers — parse request → call service → build response.
// ---------------------------------------------------------------------------

export const tokenHandler = {
  async create(c: Context) {
    try {
      const body = CreateTokenSchema.parse(await c.req.json())
      const result = await tokenService.create(body)
      return Res.created('令牌创建成功（明文仅此一次展示，请立即保存）', result).build(c)
    } catch (e) {
      return handleError(e, c, 'token')
    }
  },

  async list(c: Context) {
    try {
      const items = await tokenService.list()
      return Res.ok('查询成功', { items }).build(c)
    } catch (e) {
      return handleError(e, c, 'token')
    }
  },

  async revoke(c: Context) {
    try {
      await tokenService.revoke({ id: uuidParam(c, 'id') })
      return Res.noContent('令牌已撤销').build(c)
    } catch (e) {
      return handleError(e, c, 'token')
    }
  },
}
