# Blob 存储模块设计决策（精简版）

日期: 2026-08-04（2026-08-15 精简；完整设计文档归档于 `.ai/archive/2026-08-04-blob-storage-module-design.md`）

适用范围: `services/api/src/modules/blob` 与 `shared/storage.ts`

## 核心决策

- 文件内容只存一份，SHA-256 去重（checksum 唯一约束，重传返回已有记录）
- 物理文件对象（`blobs`）与业务附件引用（`blob_attachments`，ownerType/ownerId/role）分离——业务不直接存文件路径，防互删
- 磁盘布局 `{BLOB_ROOT}/objects/{mime-main}/{YYYY}/{MM}/{uuid}.{ext}`；读删兼容旧直根布局
- 下载走 filesystem-backed Blob（不整文件进内存）+ 单 Range 支持（206）
- 临时访问链接 = **无状态 HMAC**（`BLOB_SIGNING_SECRET`），不引入 token 表，除非明确需要撤销/次数限制/审计
- 不引入 S3/R2、不做分片上传/断点续传、不做文件安全扫描（个人工具，保持轻量）
- **Why**：个人工具优先打牢存储层（本地写入/DB 记录/失败清理边界清晰），安全（鉴权/签名）可后补

## AI 修改指南（接手本模块必守）

1. 不要把 `storagePath` 加回公开响应
2. 新业务模块不要直接存文件路径，走 `blob_attachments` 建引用
3. 业务删除时先删 attachment 引用，不直接物理删 blob（物理删除仅当无引用）
4. 修改上传/删除流程必须考虑 DB 与磁盘双写失败（DB 失败回滚磁盘，删磁盘失败仅记日志）
5. 修改磁盘布局必须保留旧布局读取兼容，除非另有迁移方案
6. 临时链接是无状态 HMAC，不要引入 token 表
7. 大文件上传不是已解决问题（下载已避免整文件 Buffer，上传待专门设计）
8. 若后续加鉴权，中间件应在 `parseBody()` 前执行，避免未授权请求先消耗上传解析资源
