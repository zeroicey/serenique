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
  UpdateDiaryInput,
  DeleteDiaryInput,
} from "@/modules/diary/diary.types";
export {
  CreateDiarySchema,
  ListDiarySchema,
  UpdateDiaryBodySchema,
} from "@/modules/diary/diary.types";

// ---- Moment module ----
export { momentService } from "@/modules/moment/moment.service";
export type {
  MomentEntry,
  CreateMomentInput,
  ListMomentInput,
  DeleteMomentInput,
} from "@/modules/moment/moment.types";
export { CreateMomentSchema, ListMomentSchema } from "@/modules/moment/moment.types";

// ---- Blob module ----
export { blobService } from "@/modules/blob/blob.service";
export type {
  BlobAttachmentEntry,
  BlobEntry,
  CreateBlobAttachmentInput,
  ListBlobInput,
} from "@/modules/blob/blob.types";
export {
  CreateBlobAttachmentSchema,
  ListBlobSchema,
} from "@/modules/blob/blob.types";

// ---- Shared utilities ----
export { AppError, ErrorCode } from "@/shared/errors";
export type { ErrorCode as ErrorCodeType } from "@/shared/errors";
export { logger } from "@/shared/logger";
export { initBlobRoot } from "@/shared/storage";

// ---- Env (for startup validation) ----
export { env as apiEnv } from "@/env";
