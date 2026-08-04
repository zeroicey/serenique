# Blobs 文件存储模块设计决策

日期: 2026-08-04

适用范围: `services/api/src/modules/blob`, `services/api/src/shared/storage.ts`, `services/api/drizzle/0003_add_blobs.sql`, `services/api/drizzle/0004_add_blob_attachments.sql`

## 背景

Serenique API 需要一个自研的本地对象存储模块，用来承载 diary、moment，以及后续 drive/netdisk 等模块的文件能力。项目主要是个人自用，也可能由其他人部署在自己的电脑上自用，因此设计目标不是做一个完整的云对象存储，而是提供一个可靠、低复杂度、可扩展的本地文件基础层。

模块最初只有普通上传和下载。后续设计调整的核心判断是: 安全能力可以逐步补，但底层存储层必须先把数据模型、生命周期、一致性、可迁移性和 AI 可理解性打牢。

## 设计目标

- 文件内容只存一份，使用 SHA-256 去重。
- 物理文件对象和业务附件引用分离，避免不同业务互相误删文件。
- 公开 API 不泄露本地磁盘布局。
- 本地磁盘写入、数据库记录和失败清理有明确边界。
- 下载路径避免一次性把完整文件读入内存，并支持基础 Range 请求。
- 提供 HMAC 临时访问链接，但不强制把所有访问都改成临时链接。
- `BLOB_ROOT` 能容忍本地系统产生的普通文件，例如 `.DS_Store`。
- 保持当前 Hono + Drizzle + Bun 的工程风格，避免引入重量级对象存储依赖。

## 非目标

- 当前不实现完整用户体系、权限模型或多租户隔离。
- 当前不实现 S3/R2 兼容 API。
- 当前不实现分片上传、断点续传上传或后台任务调度器。
- 当前不做文件内容安全扫描。
- 当前不要求所有下载都必须通过签名链接。直接访问仍保留，方便后续接入鉴权中间件。

## 模块边界

### 代码位置

- `services/api/src/modules/blob/blob.schema.ts`: Drizzle 表结构。
- `services/api/src/modules/blob/blob.types.ts`: 请求 schema 和公开响应类型。
- `services/api/src/modules/blob/blob.service.ts`: 核心业务逻辑、repository/storage 适配层、签名逻辑。
- `services/api/src/modules/blob/blob.handler.ts`: HTTP 请求处理、Range 响应、签名参数接入。
- `services/api/src/modules/blob/blob.router.ts`: Hono 路由。
- `services/api/src/shared/storage.ts`: 本地磁盘路径、读写、扫描、图片尺寸解析、checksum。
- `services/api/src/env.ts`: `BLOB_ROOT`, `BLOB_MAX_SIZE`, `BLOB_SIGNING_SECRET`。
- `services/api/drizzle/0003_add_blobs.sql`: `blobs` 表 migration。
- `services/api/drizzle/0004_add_blob_attachments.sql`: `blob_attachments` 表 migration。

### 依赖方向

HTTP handler 只做协议层工作: 解析请求、调用 service、构造响应。

Service 负责领域规则: 去重、引用保护、失败清理、签名链接、孤儿文件清理。

Storage helper 只负责本地文件系统能力: 路径生成、对象目录管理、写入、打开、删除、扫描。

Repository 适配 Drizzle: 查询和更新数据库。`createBlobService()` 支持依赖注入，方便测试不用真实 PostgreSQL。

## 数据模型

### `blobs`

`blobs` 表表示物理文件对象，不表示某个业务模块里的附件。

字段:

- `id`: UUID，物理对象 ID，也是下载和关联的主标识。
- `original_name`: 上传时的原始文件名。
- `storage_path`: 相对对象路径，不对外公开。当前格式是 `{mime-main-type}/{YYYY}/{MM}/{uuid}{ext}`。
- `mime_type`: 上传时的 MIME type，缺省为 `application/octet-stream`。
- `size`: 上传文件大小。
- `checksum`: SHA-256，唯一约束，用于内容去重。
- `metadata`: JSONB，预留给 EXIF、codec、自定义信息等。
- `width`, `height`: 图片尺寸，支持 JPEG/PNG/GIF/WebP 头部解析。
- `duration`: 预留给音视频时长。
- `created_at`: 创建时间。

设计决策:

- `checksum` 全局唯一，表示相同内容只保留一个物理对象。
- `storage_path` 只服务内部读取和删除，不属于公开 API 契约。
- `metadata` 不做统一业务校验，具体语义交给上层业务模块定义。

### `blob_attachments`

`blob_attachments` 表表示业务引用关系。它解决“同一个物理文件被多个业务记录使用时如何删除”的问题。

字段:

- `id`: UUID，附件引用 ID。
- `blob_id`: 引用的物理 blob，外键到 `blobs.id`，`ON DELETE restrict`。
- `owner_type`: 业务类型，例如 `diary`, `moment`, `drive`。
- `owner_id`: 业务记录 ID。使用 text，方便兼容 UUID、日期字符串或其他业务主键。
- `role`: 引用角色，例如 `attachment`, `inline-image`, `cover`。
- `display_name`: 业务侧展示名，可覆盖原始文件名。
- `sort_order`: 业务侧排序。
- `metadata`: 业务引用层 metadata，例如 alt、caption、裁剪参数。
- `created_at`, `updated_at`: 引用创建和更新时间。

索引:

- `blob_attachments_blob_id_idx`: 按物理文件查引用。
- `blob_attachments_owner_idx`: 按业务记录查附件。

设计决策:

- 业务模块不应该把文件元信息重复存到自己的表里，应该创建 attachment 引用。
- 删除业务附件时只删除 `blob_attachments` 行，不删除物理文件。
- 物理删除 blob 之前必须确认引用数为 0。

## 磁盘布局

当前新文件写入:

```text
{BLOB_ROOT}/objects/{mime-main-type}/{YYYY}/{MM}/{uuid}{ext}
```

示例:

```text
/data/blobs/objects/image/2026/08/0198f6bd-4f06-7289-b57d-62e8af51a4aa.png
/data/blobs/objects/application/2026/08/0198f6c3-30da-7193-b914-3e92383fe0ca.pdf
```

数据库中的 `storage_path` 仍只保存相对对象路径:

```text
image/2026/08/0198f6bd-4f06-7289-b57d-62e8af51a4aa.png
```

原因:

- 数据库不绑定绝对路径，方便换机器、换挂载点、换容器 volume。
- `objects/` 是受控对象目录，`BLOB_ROOT` 根目录可以容纳 `.DS_Store` 等本地系统文件。
- `read/delete/open` 会先查 `{BLOB_ROOT}/objects/{storage_path}`，找不到再 fallback 到旧布局 `{BLOB_ROOT}/{storage_path}`，用于兼容历史文件。

## API 设计

路由挂载在 `/api` 下。

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/blobs/upload` | multipart 上传，字段名 `file` |
| `GET` | `/api/blobs` | 分页查询 blob 元数据，支持 `mimeType`, `page`, `pageSize` |
| `GET` | `/api/blobs/:id` | 查询单个 blob 元数据 |
| `GET` | `/api/blobs/:id/file` | 下载或 inline 预览文件，`download=1` 强制 attachment |
| `POST` | `/api/blobs/:id/access-link` | 生成临时 HMAC 访问链接 |
| `DELETE` | `/api/blobs/:id` | 物理删除 blob，仅在无附件引用时允许 |
| `POST` | `/api/blobs/:id/attachments` | 为 blob 创建业务附件引用 |
| `GET` | `/api/blobs/:id/attachments` | 查询 blob 的业务附件引用 |
| `DELETE` | `/api/blob-attachments/:id` | 删除业务附件引用，不删除物理文件 |
| `POST` | `/api/blobs/cleanup-orphans` | 删除磁盘上没有 DB blob 行引用的孤儿文件 |

公开 `BlobEntry` 不包含 `storagePath`:

```ts
type BlobEntry = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  metadata: Record<string, unknown>;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: string;
};
```

`storagePath` 是内部实现细节，不应在前端、MCP 或业务 API 契约中依赖它。

## 上传流程

1. Handler 调用 `c.req.parseBody()` 解析 multipart。
2. 要求字段 `file` 存在且是 `File`。
3. 拒绝空文件。
4. Service 检查 `file.size <= BLOB_MAX_SIZE`。
5. 读取 `file.arrayBuffer()` 转为 `Buffer`。
6. 计算 SHA-256。
7. 按 checksum 查询是否已有 blob。
8. 如果已存在，直接返回已有公开 `BlobEntry`，不重复写盘。
9. 如果不存在，生成 UUID 和相对 `storagePath`。
10. 写入 `{BLOB_ROOT}/objects/{storagePath}`。
11. 对图片尝试提取宽高。
12. 插入 `blobs` 表。
13. 返回公开 `BlobEntry`。

一致性处理:

- 如果写盘成功但 DB insert 失败，会尝试删除刚写入的文件。
- 如果 DB insert 因 `blobs_checksum_unique` 冲突失败，说明可能发生并发上传同一内容。此时会清理刚写入的冗余文件，再重新按 checksum 查询已有 blob，查到则返回已有记录。
- 如果失败清理也失败，只记录 error 日志，不吞掉原始错误。

当前限制:

- 上传仍经过 `parseBody()` 和 `arrayBuffer()`，不是完整流式上传。
- 对个人部署和 100MB 默认上限可接受。
- 如果后续做网盘/大视频，应增加反代层 body limit、流式 multipart parser、分片上传或直传对象存储。

## 下载流程

`blobService.getFile(id)`:

1. 查 `blobs` 行。
2. 用 `openFileFromStorage(BLOB_ROOT, storagePath)` 打开文件。
3. 返回 `BlobFile`: `{ body: Blob, mimeType, filename, size }`。

Handler:

1. 如果 URL 带 `expires` 或 `signature`，先执行临时访问签名校验。
2. 根据 `download=1` 决定 `Content-Disposition` 是 `attachment` 还是 `inline`。
3. 如果有 `Range` header，解析单段 byte range。
4. 合法 range 返回 `206 Partial Content` 和 `Content-Range`。
5. 非法或不可满足 range 返回 `416`。
6. 无 range 返回 `200` 和完整 Blob body。

响应头:

- `Content-Type`
- `Content-Disposition`
- `Content-Length`
- `Cache-Control: public, max-age=31536000, immutable`
- `Accept-Ranges: bytes`
- Range 响应额外包含 `Content-Range`

## 临时访问链接

临时链接通过 HMAC 实现，不需要额外数据库表。

配置:

```env
BLOB_SIGNING_SECRET=<至少 32 字符的随机密钥>
```

生成接口:

```http
POST /api/blobs/:id/access-link
Content-Type: application/json

{
  "expiresInSeconds": 900
}
```

返回:

```json
{
  "url": "https://api.example.test/api/blobs/<id>/file?expires=...&signature=...",
  "path": "/api/blobs/<id>/file?expires=...&signature=...",
  "expires": 1785840000,
  "expiresAt": "2026-08-04T00:00:00.000Z",
  "signature": "..."
}
```

签名内容:

```text
HMAC-SHA256(secret, "{blobId}.{expires}") -> base64url
```

校验规则:

- `expires` 和 `signature` 必须同时存在。
- `expires` 必须是正整数 Unix timestamp 秒。
- 当前时间超过 `expires` 时拒绝。
- 使用 `timingSafeEqual` 比较签名，避免普通字符串比较。
- 篡改 blob id、expires 或 signature 都会失败。

设计取舍:

- 这种签名是无状态的，复杂度低。
- 无法主动撤销单条链接，除非轮换 `BLOB_SIGNING_SECRET`。
- 如果后续需要可撤销分享、访问次数限制、审计日志，可以新增 `blob_shares` 表。

## 附件生命周期

推荐业务流程:

1. 客户端或业务模块先上传文件，拿到 `blob.id`。
2. 业务模块创建自己的记录，例如 diary/moment。
3. 业务模块调用 `createAttachment(blobId, ownerType, ownerId, role...)` 建立引用。
4. 展示业务记录时，按 `ownerType + ownerId` 查附件，或在业务 service 中封装对应查询。
5. 删除业务记录时，先删除对应 `blob_attachments`。
6. 物理 blob 只有在引用数为 0 时才允许删除。

重要规则:

- `DELETE /api/blob-attachments/:id` 只删引用。
- `DELETE /api/blobs/:id` 是物理删除，会检查引用数。
- 如果仍有引用，返回 `409 CONFLICT`。
- 外键 `ON DELETE restrict` 是数据库层兜底，service 层会先做更清晰的错误处理。

## 孤儿文件清理

孤儿文件定义:

```text
存在于 {BLOB_ROOT}/objects 下，但没有任何 blobs.storage_path 行引用的磁盘文件
```

触发:

```http
POST /api/blobs/cleanup-orphans
```

返回:

```ts
type BlobCleanupResult = {
  checked: number;
  deleted: string[];
  failed: Array<{ path: string; message: string }>;
};
```

设计取舍:

- 只扫描 `objects/` 管理目录，不扫描整个 `BLOB_ROOT`。
- 不删除旧 direct-root 布局文件，避免兼容迁移期误删。
- 这是手动维护接口，不是后台定时任务。

## 错误和状态码

常见错误:

- 上传体解析失败: `400`
- 缺少 `file`: `400`
- 空文件: `400`
- 文件超过 `BLOB_MAX_SIZE`: `413`
- blob 不存在: `404`
- attachment 不存在: `404`
- blob 仍有 attachment 引用，拒绝物理删除: `409`
- 临时链接缺签名、过期或无效: `403`
- 未配置 `BLOB_SIGNING_SECRET` 时生成或校验签名: `500`
- Range 不合法或不可满足: `416`

## 环境变量

```env
DATABASE_URL=postgresql://...
BLOB_ROOT=/data/blobs
BLOB_MAX_SIZE=104857600
BLOB_SIGNING_SECRET=<optional, at least 32 chars>
```

说明:

- `BLOB_ROOT` 是挂载根目录，真实对象在 `BLOB_ROOT/objects`。
- `BLOB_MAX_SIZE` 默认 100MB。
- `BLOB_SIGNING_SECRET` 不配置时，临时访问链接能力不可用。
- 不要把 `BLOB_SIGNING_SECRET` 写进文档、提交记录或日志。

## 测试覆盖

当前关键测试:

- `services/api/src/modules/blob/blob.service.test.ts`
  - 公开 `BlobEntry` 不暴露 `storagePath`。
  - attachment 引用存在时禁止物理删除。
  - 删除 attachment 只删除引用。
  - DB insert 失败后清理刚写入的磁盘文件。
  - checksum 唯一冲突时清理冗余文件并返回已有 blob。
  - `cleanupOrphanFiles()` 删除无 DB 引用的磁盘文件。
  - `getFile()` 返回 Blob body descriptor，而不是 Buffer。
  - 临时访问链接生成、校验、过期和篡改失败。
- `services/api/src/modules/blob/blob.handler.test.ts`
  - `parseBlobRange()` 支持 bounded/open-ended/suffix range。
  - 非法和不可满足 range 返回 null。
- `services/api/src/shared/storage.test.ts`
  - `initBlobRoot()` 容忍 `.DS_Store`。
  - 新文件写入 `objects/`。
  - 旧 direct-root 布局仍可读取。

常用验证命令:

```bash
bun run typecheck
bun test
```

## AI 修改指南

后续 AI 接手此模块时，应优先遵守这些约束:

1. 不要把 `storagePath` 加回公开响应。
2. 新业务模块不要直接存文件路径，应该通过 `blob_attachments` 建引用。
3. 不要在业务删除时直接物理删除 blob，先删 attachment。
4. 修改上传/删除流程时必须考虑 DB 和磁盘双写失败。
5. 修改磁盘布局时必须保留旧布局读取兼容，除非另有迁移方案。
6. 临时链接是无状态 HMAC，不要引入 token 表，除非明确需要撤销、次数限制或审计。
7. 大文件上传不是当前已解决问题。下载已避免完整 Buffer，上传仍需要后续专门设计。
8. 若后续加入鉴权，中间件应在 `parseBody()` 前执行，避免未授权请求先消耗上传解析资源。

## 后续可选演进

- 加 API token 或 passkey auth，并在 blob 路由前执行。
- 在反向代理或 Hono 层增加请求体大小限制，早于 multipart 解析。
- 为业务模块增加按 `ownerType + ownerId` 查询附件的 service API。
- 增加 `blob_shares` 表，实现可撤销分享链接、访问次数、分享名称和审计日志。
- 增加后台任务或 CLI 来执行 orphan cleanup。
- 如果要支持网盘场景，重新设计上传为流式 multipart、分片上传或 S3/R2 direct upload。
- 增加 MIME sniffing，避免完全信任客户端上传的 `file.type`。
- 增加文件迁移脚本，把旧 direct-root 文件搬到 `objects/`。
