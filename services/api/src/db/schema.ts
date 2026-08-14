// ---------------------------------------------------------------------------
// Central schema registry — every module's table definitions are re-exported here.
// Drizzle Kit reads this file to generate migrations.
// ---------------------------------------------------------------------------

export { auditLogs } from '@/modules/audit/audit.schema'
export { passkeyCredentials, users } from '@/modules/auth/auth.schema'
export { blobAttachments, blobs } from '@/modules/blob/blob.schema'
export { events } from '@/modules/event/event.schema'
export { momentComments } from '@/modules/moment/comment.schema'
export { moments } from '@/modules/moment/moment.schema'
export { tagRelations, tags } from '@/modules/tag/tag.schema'
export { taskGroups, tasks } from '@/modules/task/task.schema'
export { apiTokens } from '@/modules/tokens/token.schema'
