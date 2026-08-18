import type { Context } from 'hono'
import { aiMemoryService } from '@/modules/ai-memory/ai-memory.service'
import { AiMemorySchema } from '@/modules/ai-memory/ai-memory.types'
import { handleError } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// AI memory handlers — GET（返回用户画像，无记录视为空画像）/ PUT（upsert）。
// ---------------------------------------------------------------------------

export const aiMemoryHandler = {
  async get(c: Context) {
    try {
      const entry = await aiMemoryService.get()
      return Res.ok('查询成功', entry).build(c)
    } catch (e) {
      return handleError(e, c, 'ai-memory')
    }
  },

  async put(c: Context) {
    try {
      const body = AiMemorySchema.parse(await c.req.json())
      const entry = await aiMemoryService.upsert(body)
      return Res.ok('用户画像已更新', entry).build(c)
    } catch (e) {
      return handleError(e, c, 'ai-memory')
    }
  },
}
