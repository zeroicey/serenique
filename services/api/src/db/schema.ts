// ---------------------------------------------------------------------------
// Central schema registry — every module's table definitions are re-exported here.
// Drizzle Kit reads this file to generate migrations.
// ---------------------------------------------------------------------------

export { diaries } from "@/modules/diary/diary.schema";
export { moments } from "@/modules/moment/moment.schema";
export { blobs } from "@/modules/blob/blob.schema";
