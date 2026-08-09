// ---------------------------------------------------------------------------
// Central schema registry — every module's table definitions are re-exported here.
// Drizzle Kit reads this file to generate migrations.
// ---------------------------------------------------------------------------

export { moments } from "@/modules/moment/moment.schema";
export { momentComments } from "@/modules/moment/comment.schema";
export { blobs, blobAttachments } from "@/modules/blob/blob.schema";
export { taskGroups, tasks } from "@/modules/task/task.schema";
export { events } from "@/modules/event/event.schema";
export { auditLogs } from "@/modules/audit/audit.schema";
export { tags, tagRelations } from "@/modules/tag/tag.schema";
export { users, passkeyCredentials } from "@/modules/auth/auth.schema";
export { apiTokens } from "@/modules/tokens/token.schema";
