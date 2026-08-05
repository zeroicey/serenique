// ---------------------------------------------------------------------------
// Central schema registry — every module's table definitions are re-exported here.
// Drizzle Kit reads this file to generate migrations.
// ---------------------------------------------------------------------------

export { diaries } from "@/modules/diary/diary.schema";
export { moments } from "@/modules/moment/moment.schema";
export { blobs, blobAttachments } from "@/modules/blob/blob.schema";
export { taskGroups, tasks } from "@/modules/task/task.schema";
export { events } from "@/modules/event/event.schema";
