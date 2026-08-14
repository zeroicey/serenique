import type { Context } from 'hono'
import { bodyLimit as honoBodyLimit } from 'hono/body-limit'
import { env } from '@/env'
import { Res } from '@/shared/response'

// ---------------------------------------------------------------------------
// 请求体上限中间件（hono 内置 bodyLimit）。
//
// 上限 = max(BODY_LIMIT_MAX_SIZE（缺省 100MB）, BLOB_MAX_SIZE + 1MB 余量)：
// - 必须 ≥ blob 上传上限：/api/blobs/upload 支持 100MB 文件（BLOB_MAX_SIZE），
//   multipart 信封还会带来少量额外字节，留 1MB 余量避免恰好卡线；
// - 文件真实大小由 blob.service.assertBlobSize 校验（超限 400），本中间件
//   只兜底「整体请求体」防超大垃圾流量打满内存。
// - 超限响应走统一信封（413 PAYLOAD_TOO_LARGE）。
// ---------------------------------------------------------------------------

export function bodyLimit(maxSize?: number) {
  const limit =
    maxSize ??
    Math.max(env.BODY_LIMIT_MAX_SIZE ?? 100 * 1024 * 1024, env.BLOB_MAX_SIZE + 1024 * 1024)
  return honoBodyLimit({
    maxSize: limit,
    onError: (c: Context) => Res.error('请求体过大').status(413).code('PAYLOAD_TOO_LARGE').build(c),
  })
}
