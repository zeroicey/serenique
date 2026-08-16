// ---------------------------------------------------------------------------
// Public exports for workspace consumers (e.g., the MCP service).
// Re-exports only the service layer and shared utilities — no Hono handlers,
// routers, response builders, or middleware.
//
// External consumers import from "@serenique/api" (the package entry point).
// ---------------------------------------------------------------------------

// ---- Env (for startup validation) ----
export { env as apiEnv } from '@/env'
// ---- Audit module ----
export { auditService } from '@/modules/audit/audit.service'
export type {
  AuditEvent,
  AuditLogEntry,
  ListAuditInput,
  MarkReadInput,
  RecordAuditInput,
} from '@/modules/audit/audit.types'
export {
  AUDIT_EVENTS,
  ListAuditSchema,
  MarkReadSchema,
  RecordAuditSchema,
} from '@/modules/audit/audit.types'
// ---- Auth module (Passkey) ----
export { authService } from '@/modules/auth/auth.service'
export type {
  AuthMeEntry,
  CredentialEntry,
  LoginFinishInput,
  LoginFinishOutcome,
  RegisterFinishInput,
  RegisterStartInput,
  UpdateUserProfileInput,
  UserEntry,
} from '@/modules/auth/auth.types'
export {
  DateOnlySchema,
  LoginFinishSchema,
  RegisterFinishSchema,
  RegisterStartSchema,
  UpdateUserProfileSchema,
} from '@/modules/auth/auth.types'
// ---- Blob module ----
export { blobService } from '@/modules/blob/blob.service'
export type {
  BlobAccessLinkEntry,
  BlobAttachmentEntry,
  BlobCleanupResult,
  BlobEntry,
  BlobFile,
  CreateBlobAccessLinkInput,
  CreateBlobAttachmentInput,
  ListBlobInput,
} from '@/modules/blob/blob.types'
export {
  CreateBlobAccessLinkSchema,
  CreateBlobAttachmentSchema,
  ListBlobSchema,
} from '@/modules/blob/blob.types'
// ---- Event module ----
export { eventService } from '@/modules/event/event.service'
export type {
  CreateEventInput,
  DeleteEventInput,
  EventEntry,
  GetEventInput,
  ListEventInput,
  UpdateEventInput,
} from '@/modules/event/event.types'
export {
  CreateEventSchema,
  ListEventSchema,
  UpdateEventSchema,
} from '@/modules/event/event.types'
export type { OverviewBody } from '@/modules/habit/habit.domain'
// ---- Habit module ----
export { habitService } from '@/modules/habit/habit.service'
export type {
  ClearDailyInput,
  CreateHabitInput,
  DailyEntry,
  DeleteHabitInput,
  HabitEntry,
  ListDailyInput,
  OverviewInput,
  SetDailyInput,
  UpdateHabitInput,
} from '@/modules/habit/habit.types'
export {
  CreateHabitSchema,
  DailyDateSchema,
  DailyStatusSchema,
  HabitKindSchema,
  ListDailySchema,
  OverviewSchema,
  SetDailySchema,
  UpdateHabitSchema,
} from '@/modules/habit/habit.types'
// ---- Location module (AMAP proxy) ----
export { locationService } from '@/modules/location/location.service'
export type {
  LocationConfigEntry,
  LocationItem,
  LocationQueryResult,
  NearbyInput,
  SearchInput,
} from '@/modules/location/location.types'
export {
  NearbyQuerySchema,
  SearchQuerySchema,
} from '@/modules/location/location.types'
export { momentCommentService } from '@/modules/moment/comment.service'
export type {
  CreateMomentCommentInput,
  DeleteMomentCommentInput,
  GetMomentCommentInput,
  ListMomentCommentsInput,
  MomentCommentEntry,
  UpdateMomentCommentInput,
} from '@/modules/moment/comment.types'
export {
  CreateMomentCommentSchema,
  UpdateMomentCommentSchema,
} from '@/modules/moment/comment.types'
// ---- Moment module ----
export { momentService } from '@/modules/moment/moment.service'
export type {
  AddMomentAttachmentInput,
  AddMomentTagInput,
  CreateMomentInput,
  DeleteMomentAttachmentInput,
  DeleteMomentInput,
  GetMomentInput,
  ListMomentInput,
  MomentAttachmentEntry,
  MomentBlobEntry,
  MomentEntry,
  MomentLocation,
  RemoveMomentTagInput,
  UpdateMomentInput,
} from '@/modules/moment/moment.types'
export {
  AddMomentAttachmentSchema,
  AddMomentTagSchema,
  CreateMomentSchema,
  ListMomentSchema,
  MomentAttachmentInputSchema,
  MomentLocationSchema,
  UpdateMomentSchema,
} from '@/modules/moment/moment.types'
// ---- Tag module ----
export { tagService } from '@/modules/tag/tag.service'
export type {
  AttachTagInput,
  CreateTagInput,
  DeleteTagInput,
  DetachTagInput,
  GetTagInput,
  ListTagInput,
  RenameTagInput,
  ReplaceTagsInput,
  TagEntry,
  TagRelationEntry,
} from '@/modules/tag/tag.types'
export {
  AttachTagSchema,
  CreateTagSchema,
  DetachTagSchema,
  ListTagSchema,
  RenameTagSchema,
  ReplaceTagsSchema,
  TagNameSchema,
} from '@/modules/tag/tag.types'
// ---- Task module ----
export { taskService } from '@/modules/task/task.service'
export type {
  CreateTaskGroupInput,
  CreateTaskInput,
  DeleteTaskGroupInput,
  DeleteTaskInput,
  GetTaskGroupInput,
  GetTaskInput,
  ListTaskGroupInput,
  ListTaskInput,
  TaskEntry,
  TaskGroupEntry,
  UpdateTaskGroupInput,
  UpdateTaskInput,
} from '@/modules/task/task.types'
export {
  CreateTaskGroupSchema,
  CreateTaskSchema,
  ListTaskGroupSchema,
  ListTaskSchema,
  TaskStatusSchema,
  UpdateTaskGroupSchema,
  UpdateTaskSchema,
} from '@/modules/task/task.types'
// ---- Tokens module ----
export { tokenService } from '@/modules/tokens/token.service'
export type {
  CreateTokenInput,
  TokenCreateResult,
  TokenEntry,
} from '@/modules/tokens/token.types'
export { CreateTokenSchema } from '@/modules/tokens/token.types'
export type { ErrorCode as ErrorCodeType } from '@/shared/errors'
// ---- Shared utilities ----
export { AppError, ErrorCode } from '@/shared/errors'
export { logger } from '@/shared/logger'
export { initBlobRoot } from '@/shared/storage'
