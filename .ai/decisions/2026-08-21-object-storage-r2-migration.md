# 对象存储迁移到 Cloudflare R2（实施决策汇总 ADR）

日期: 2026-08-21（实施完成）；需求: `.ai/requirements/2026-08-20-object-storage-r2.md`（✅已实施）
适用范围: `services/api`（blob 模块）、`infra/r2-gateway`（Worker）、Web/移动端、hpcore 生产部署
决策链: `.pi/decision-auditor/chain.md` D-029~D-034（本文件是入链决策的正式落档）

## 结论（How）

- R2 bucket `serenique`（APAC）为**私有桶**：不启用 r2.dev、不绑 bucket 级自定义域名（公开读）。
- 自定义域名 `s3.0icey.icu` 挂 **Worker 网关** `serenique-r2-gateway`（`infra/r2-gateway/gateway.js`）：
  - 读 GET/HEAD：校验 HMAC `v1:{storagePath}:{expires}`（query e/s）→ `env.BUCKET.get`（支持 Range 206、CORS、private 缓存）
  - 写 PUT：校验 HMAC `up:{storagePath}:{expires}:{contentLength}`（Content-Length 必须等于签名 size）→ `env.BUCKET.put`
- 上传=**客户端直传两步**：`POST /api/blobs/upload-url`（后端本地签发 PUT 凭据）→ 客户端直连 s3.0icey.icu PUT → `POST /api/blobs/confirm`（按 checksum 去重 + 落 DB，幂等）。local 后端下 upload-url 400 → 客户端回退旧 multipart。
- 预览=签名直链：`POST /api/blobs/:id/access-link` 返回有效期内**稳定复用**的签名 URL（Web 会话级缓存、移动端 keepAlive + 磁盘缓存，防滚动重载）。
- 存储层：`shared/storage.ts` local|r2 双后端（`STORAGE_BACKEND` 切换）；`@aws-sdk/client-s3` 仅用于迁移脚本/管理工具（本机直连）。
- 数据迁移：`services/api/scripts/migrate-blobs-to-r2.ts`（幂等、可断点续传）；44 个历史对象已迁，数据无分叉。

## 为什么（Why）

- **R2 自定义域名/ r2.dev 绑定 = 强制公开读**，违背「仅自己可访问」；S3 预签名又只能指向 `*.r2.cloudflarestorage.com`（无自定义域名 CDN）。→ Worker 网关同时满足私有 + CDN + Range 流式。
- **生产 API（Bun 运行时）无法访问 R2**：Bun 的 `node:tls.connect({socket})` 报 `Invalid socket`，所有 http-proxy/undici 代理库在 Bun 下 hang；容器直连被 fake-ip/国内直连不通（多轮探针证实）。→ 架构改为「客户端直传」，**API 零 R2 网络**（更无状态、不扛文件流量）。
- 用标准 S3 协议（@aws-sdk/client-s3）保留未来迁移腾讯 COS / 阿里 OSS 的能力（同协议，改 endpoint+凭据）。
- 签名直链有效期内必须**稳定复用同一 URL**（否则每次重签换 expires → `<img>` src 变 → 滚动/分页反复重载，D-033）。
- 直传无法离线提取图片尺寸 → width/height 记 null（moment UI 不消费，显式接受，D-034）。

## 关键密钥/环境（生产 .env）

`STORAGE_BACKEND=r2`、`R2_PUBLIC_HOST=https://s3.0icey.icu`、`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID/SECRET`（dashboard 创建）、`R2_BUCKET=serenique`、`R2_ACCESS_SIGNING_SECRET`（与 Worker 同名 secret 完全一致）。所有 R2 密钥只进服务器 .env，绝不入库。

## 回滚

`STORAGE_BACKEND=local` 即回退本地 volume（数据保留），`createAccessLink` 自动切回 API 代理链接（D-031 绑定后端开关）。
