import { z } from 'zod'

// ---------------------------------------------------------------------------
// Request validation schemas
// ---------------------------------------------------------------------------

export const ListBlobSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  /** Filter by MIME type prefix, e.g. "image/" shows all image subtypes. */
  mimeType: z
    .string()
    .regex(/^[a-z]+\/$/, 'mimeType 需为类型前缀，如 image/')
    .optional(),
})

export const CreateBlobAttachmentSchema = z.object({
  ownerType: z.string().min(1).max(64),
  ownerId: z.string().min(1).max(128),
  role: z.string().min(1).max(64).default('attachment'),
  displayName: z.string().min(1).max(255).optional(),
  sortOrder: z.coerce.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const CreateBlobAccessLinkSchema = z.object({
  expiresInSeconds: z.coerce
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60 * 60)
    .default(15 * 60),
  /** 链接指向原文件（默认）还是缩略图（图片网格用，见 shared/storage.ts）。 */
  kind: z.enum(['original', 'thumb']).optional(),
})

/** 直传上传请求（r2 后端）：预分配 storagePath + 签发 PUT 直传 URL。 */
export const CreateUploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  /** 建议填 MIME（确定 storagePath 的 mime-main 目录）；缺省 application/octet-stream。 */
  mimeType: z.string().min(1).max(255).optional(),
  size: z.coerce.number().int().positive(),
})

/** 直传完成确认：去重 + 落 blobs 行（元数据由客户端上报）。 */
export const ConfirmUploadSchema = z.object({
  blobId: z.string().uuid(),
  storagePath: z.string().min(1).max(512),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  size: z.coerce.number().int().positive(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/, 'checksum 必须是 64 位 hex（SHA-256）'),
})

export type ListBlobInput = z.infer<typeof ListBlobSchema>
export type CreateBlobAccessLinkInput = z.infer<typeof CreateBlobAccessLinkSchema>
export type CreateUploadUrlInput = z.infer<typeof CreateUploadUrlSchema>
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadSchema>

/** r2 直传上传凭据：客户端拿 `url` 直接 PUT，完成后调 confirmUpload。 */
export type UploadUrlEntry = {
  blobId: string
  storagePath: string
  method: 'PUT'
  url: string
  expires: number
  expiresAt: string
  mode: 'direct-r2'
}
// Explicit structural input type (not z.input): sortOrder uses z.coerce, which
// would make z.input resolve to `unknown`. Defaulted fields stay optional so
// callers can pass bare objects; the service applies the defaults.
export type CreateBlobAttachmentInput = {
  ownerType: string
  ownerId: string
  role?: string
  displayName?: string
  sortOrder?: number
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Response / domain types
// ---------------------------------------------------------------------------

export type BlobEntry = {
  id: string
  originalName: string
  mimeType: string
  size: number
  checksum: string
  metadata: Record<string, unknown>
  width: number | null
  height: number | null
  duration: number | null
  createdAt: string
  /** 被业务附件（blob_attachments）引用的数量；>0 时不可物理删除。 */
  refCount: number
}

export type BlobAttachmentEntry = {
  id: string
  blobId: string
  ownerType: string
  ownerId: string
  role: string
  displayName: string | null
  sortOrder: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type BlobFile = {
  body: Blob
  mimeType: string
  filename: string
  size: number
}

export type BlobAccessLinkEntry = {
  url: string
  path: string
  expires: number
  expiresAt: string
  signature: string
}

export type BlobCleanupResult = {
  checked: number
  deleted: string[]
  failed: Array<{
    path: string
    message: string
  }>
}
