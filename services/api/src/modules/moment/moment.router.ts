import { Hono } from 'hono'
import { momentHandler } from '@/modules/moment/moment.handler'

// ---------------------------------------------------------------------------
// Moment router — RESTful routes mounted under /api/moments
// ---------------------------------------------------------------------------

export const momentRouter = new Hono()
  .get('/moments', momentHandler.list)
  .post('/moments', momentHandler.create)
  .get('/moments/:id/comments', momentHandler.listComments)
  .post('/moments/:id/comments', momentHandler.addComment)
  .put('/moments/:id/comments/:commentId', momentHandler.updateComment)
  .delete('/moments/:id/comments/:commentId', momentHandler.deleteComment)
  .post('/moments/:id/attachments', momentHandler.addAttachment)
  .delete('/moments/:id/attachments/:attachmentId', momentHandler.deleteAttachment)
  .post('/moments/:id/tags', momentHandler.addTag)
  .put('/moments/:id/tags', momentHandler.replaceTags)
  .delete('/moments/:id/tags/:tagId', momentHandler.removeTag)
  .get('/moments/:id', momentHandler.get)
  .put('/moments/:id', momentHandler.update)
  .delete('/moments/:id', momentHandler.delete)
