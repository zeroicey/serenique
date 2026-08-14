import type { Context } from 'hono'
import { auditService } from '@/modules/audit/audit.service'
import { ListAuditSchema, MarkReadSchema } from '@/modules/audit/audit.types'
import { handleError } from '@/shared/handler'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// Audit handlers — parse request → call service → build response.
// Read-only surface: list / unread-count / mark-read. No write API.
// ---------------------------------------------------------------------------

export const auditHandler = {
  async list(c: Context) {
    try {
      const query = ListAuditSchema.parse(c.req.query())
      const result = await auditService.list(query)
      return Res.ok('查询成功', result).build(c)
    } catch (e) {
      return handleError(e, c, 'audit')
    }
  },

  async unreadCount(c: Context) {
    try {
      const unreadCount = await auditService.unreadCount()
      return Res.ok('查询成功', { unreadCount }).build(c)
    } catch (e) {
      return handleError(e, c, 'audit')
    }
  },

  async markRead(c: Context) {
    try {
      const body = MarkReadSchema.parse(await c.req.json())
      const result = await auditService.markRead(body)
      return Res.ok('已标记为已读', result).build(c)
    } catch (e) {
      return handleError(e, c, 'audit')
    }
  },
}
