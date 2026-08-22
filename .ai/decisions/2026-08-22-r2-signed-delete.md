# R2 对象删除改走 Worker 网关签名删除（del: 签名域）

- 日期：2026-08-22
- 状态：✅已实施（工作树未提交，待 review 后随审计批次合并）
- 关联：D-029（Worker 网关私桶 + 自签直链）、D-031（能力启用绑定生效后端开关）、D-032（API 零 R2 网络）

## Why

生产已切 `STORAGE_BACKEND=r2`（2026-08-21），D-032 定案「API 容器零 R2 网络」：Bun 无法经 CONNECT 代理访问 R2、容器直连被墙。但全仓审计发现 `blob.service.ts` 的 `delete()`/`cleanupOrphanFiles()`/旧 multipart `upload()` 在 r2 模式仍直接调用 `shared/storage.ts` 的 S3 客户端（DeleteObject/ListObjectsV2/PutObject）——无任何守卫。后果：

- 素材库删除在生产挂起/超时，DB 行先删成功但 R2 对象残留（孤儿积累，旧签名链接在有效期内仍可访问）
- 违反 D-032，与 `createAccessLink`（纯本地 HMAC 签名、零网络）的设计意图直接冲突

## 方案对比

| 方案 | 否决理由 |
| --- | --- |
| API 容器内直连 R2 删除 | 被墙/代理不兼容（D-032 已证），不可行 |
| API 守卫 + 本机脚本兜底清理 | 保留容器 S3 超时拖慢响应；孤儿对象在过期前仍可访问，隐私风险；与直传设计不一致 |
| **Worker 网关签名删除（采纳）** | 与读直链/直传同一设计语言：API 只做纯本地 HMAC 签发，客户端直发网关执行。删除凭证短时有效（1h），D-032 完整性保持 |

## How（How to apply）

1. 新增删除签名域 `del:`（与读 `v1:`、写 `up:` 前缀互异，HMAC-SHA256 为 PRF，跨域不可重用）：`HMAC(secret, "del:" + storagePath + ":" + expires)` hex。
2. API 侧 `blob.domain.ts` 的 `signR2Delete` 与网关 `gateway.js` DELETE 分支必须逐字一致，改动需同步（固定向量测试锁定格式）。
3. 删除流：API `delete()` 先做引用检查（409 保护）→ 校验 R2 配置（缺配置在删库前 500）→ 签发原图 + 缩略图两个签名删除 URL → 删 DB 行 + audit → 返回 `{ deleted, deleteUrls }`（local 后端保持 204 直删文件）。客户端拿到 deleteUrls 后校验官方网关 origin 再 fire-and-forget 直发网关 DELETE。
4. 守卫规则（r2 模式）：`upload()`（旧 multipart，引导直传）、`getFile()`/`getThumbnail()`（代理读，引导直链）、`cleanupOrphanFiles()`（引导迁移脚本环境）一律抛 400，容器内零 S3 IO。
5. 网关 fail-closed：`fetch()` 顶部校验 `R2_ACCESS_SIGNING_SECRET` 缺失即 500（防 `encoder.encode(undefined)` 把字面量 "undefined" 当 HMAC 密钥 = 公开伪造全部签名域）。

## 遗留（明确不在本决策范围）

- 移动端（Flutter）与 CLI 未消费 `deleteUrls`：DB 删除成功但 R2 对象残留孤儿（需各自接入直发网关 DELETE；CLI 另需接 upload-url/confirm 直传）
- 孤儿清理：r2 模式 API 禁跑 cleanupOrphans，需本机直连对账脚本（runbook 已记提示）
- 网关需 `wrangler deploy` 发布新分支（secret 不变）
