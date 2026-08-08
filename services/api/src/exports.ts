// ---------------------------------------------------------------------------
// Public exports for workspace consumers (e.g., the MCP service).
// Re-exports only the service layer and shared utilities — no Hono handlers,
// routers, response builders, or middleware.
//
// External consumers import from "@serenique/api" (the package entry point).
// ---------------------------------------------------------------------------

// ---- Diary module ----
export { diaryService } from "@/modules/diary/diary.service";
export type {
  DiaryEntry,
  CreateDiaryInput,
  ListDiaryInput,
  GetDiaryInput,
  GetDiaryByDateInput,
  UpdateDiaryInput,
  DeleteDiaryInput,
} from "@/modules/diary/diary.types";
export {
  CreateDiarySchema,
  GetDiaryByDateSchema,
  ListDiarySchema,
  UpdateDiaryBodySchema,
} from "@/modules/diary/diary.types";

// ---- Moment module ----
export { momentService } from "@/modules/moment/moment.service";
export { momentCommentService } from "@/modules/moment/comment.service";
export type {
  AddMomentAttachmentInput,
  DeleteMomentAttachmentInput,
  MomentEntry,
  MomentAttachmentEntry,
  MomentBlobEntry,
  CreateMomentInput,
  ListMomentInput,
  GetMomentInput,
  UpdateMomentInput,
  DeleteMomentInput,
} from "@/modules/moment/moment.types";
export {
  AddMomentAttachmentSchema,
  CreateMomentSchema,
  ListMomentSchema,
  MomentAttachmentInputSchema,
  UpdateMomentSchema,
} from "@/modules/moment/moment.types";
export type {
  MomentCommentEntry,
  CreateMomentCommentInput,
  UpdateMomentCommentInput,
  ListMomentCommentsInput,
  GetMomentCommentInput,
  DeleteMomentCommentInput,
} from "@/modules/moment/comment.types";
export {
  CreateMomentCommentSchema,
  UpdateMomentCommentSchema,
} from "@/modules/moment/comment.types";

// ---- Blob module ----
export { blobService } from "@/modules/blob/blob.service";
export type {
  BlobAttachmentEntry,
  BlobAccessLinkEntry,
  BlobCleanupResult,
  BlobEntry,
  BlobFile,
  CreateBlobAccessLinkInput,
  CreateBlobAttachmentInput,
  ListBlobInput,
} from "@/modules/blob/blob.types";
export {
  CreateBlobAccessLinkSchema,
  CreateBlobAttachmentSchema,
  ListBlobSchema,
} from "@/modules/blob/blob.types";

// ---- Task module ----
export { taskService } from "@/modules/task/task.service";
export type {
  TaskEntry,
  TaskGroupEntry,
  CreateTaskInput,
  CreateTaskGroupInput,
  ListTaskInput,
  ListTaskGroupInput,
  GetTaskInput,
  GetTaskGroupInput,
  UpdateTaskInput,
  UpdateTaskGroupInput,
  DeleteTaskInput,
  DeleteTaskGroupInput,
} from "@/modules/task/task.types";
export {
  CreateTaskSchema,
  UpdateTaskSchema,
  ListTaskSchema,
  CreateTaskGroupSchema,
  ListTaskGroupSchema,
  UpdateTaskGroupSchema,
  TaskStatusSchema,
} from "@/modules/task/task.types";

// ---- Event module ----
export { eventService } from "@/modules/event/event.service";
export type {
  EventEntry,
  CreateEventInput,
  UpdateEventInput,
  ListEventInput,
  GetEventInput,
  DeleteEventInput,
} from "@/modules/event/event.types";
export {
  CreateEventSchema,
  UpdateEventSchema,
  ListEventSchema,
} from "@/modules/event/event.types";

// ---- Audit module ----
export { auditService } from "@/modules/audit/audit.service";
export type {
  AuditLogEntry,
  AuditEvent,
  RecordAuditInput,
  ListAuditInput,
  MarkReadInput,
} from "@/modules/audit/audit.types";
export {
  AUDIT_EVENTS,
  RecordAuditSchema,
  ListAuditSchema,
  MarkReadSchema,
} from "@/modules/audit/audit.types";

// ---- Shared utilities ----
export { AppError, ErrorCode } from "@/shared/errors";
export type { ErrorCode as ErrorCodeType } from "@/shared/errors";
export { logger } from "@/shared/logger";
export { initBlobRoot } from "@/shared/storage";

// ---- Env (for startup validation) ----
export { env as apiEnv } from "@/env";
