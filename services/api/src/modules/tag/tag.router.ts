import { Hono } from 'hono'
import { tagHandler } from '@/modules/tag/tag.handler'

// ---------------------------------------------------------------------------
// Tag router — RESTful routes mounted under /api/tags. Generic attach/detach
// serve any registered ownerType (currently "moment"); moment-side nested
// convenience routes live in the moment router.
// ---------------------------------------------------------------------------

export const tagRouter = new Hono()
  .get('/tags', tagHandler.listTags)
  .post('/tags', tagHandler.createTag)
  .get('/tags/:id', tagHandler.getTag)
  .put('/tags/:id', tagHandler.renameTag)
  .delete('/tags/:id', tagHandler.deleteTag)
  .post('/tags/:id/attach', tagHandler.attachTag)
  .delete('/tags/:id/detach', tagHandler.detachTag)
