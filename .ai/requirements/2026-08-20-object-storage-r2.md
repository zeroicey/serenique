# 文件存储迁移到 Cloudflare R2 对象存储

- 日期：2026-08-20
- 状态：🔶设计中（可行性已初步调研，见本文件 §5；实施待排期）
- 范围：`services/api`（blob 存储层）、部署（hpcore / Docker compose）、数据迁移
- 相关文档：`.ai/runbooks/hpcore-deploy.md`（服务器拓扑）

---

## 1. 背景与目标

当前所有用户文件（Moment 附件：图片/视频/音频等）都存在 **API 容器本地磁盘**：

- `BLOB_ROOT=/data/blobs`（Docker named volume，非 root UID 10001）
- 路径结构：`objects/{mime-main}/{YYYY}/{MM}/{uuid}{ext}`（另有 legacy 平铺路径，向后兼容）
- 文件访问**全部经 API 代理**：`GET /api/blobs/:id/file`（支持 Range / 206 流式），鉴权走 HMAC 签名链接（`expires+signature` query）或直连，无任何公网直连 URL

目标：把文件存储切到 **Cloudflare R2 对象存储**（S3 兼容），摆脱对单机磁盘卷的依赖。

**驱动力**（用户提出）：

- 了解切换 R2 的改动面与迁移工作量，评估可行性后决定是否实施。

## 2. 关键约束（调研结论）

| # | 约束 | 结论 |
| --- | ------ | ------ |
| ① | blob 文件 I/O 全部集中在 `services/api/src/shared/storage.ts` | 单一接缝，改动面集中，是迁移的最大利好 |
| ② | 调用方只有 `blob.service.ts`（saveFile / openFileFromStorage / deleteFileFromStorage / listStoragePaths） | 换实现不影响上层业务逻辑 |
| ③ | 数据库只存 `blobs.storage_path` 字符串，不存文件体 | **DB schema 零改动**，storage_path 语义可原样映射到 R2 key |
| ④ | 所有文件访问都走 API 代理 + 签名链接，无公网直链 | R2 **不能走公开读**（日记/Moment 隐私），必须私桶 + 签名/代理 |
| ⑤ | getFile 支持 Range / 206（视频/音频流式） | S3 GetObject 原生支持 Range 头 → 流式逻辑基本不变 |
| ⑥ | 业务模块（moment/ai）通过 blob 模块间接使用存储 | 上方业务层不受影响 |
| ⑦ | AI 会话 jsonl (`/data/sessions`) 是**另一处本地文件**，非 blob | 默认**不在本次范围**，见 §6 决策点 |

## 3. 技术选型（调研中，倾向）

| 项 | 选择 | 说明 |
| ---- | ------ | ------ |
| S3 客户端 | `@aws-sdk/client-s3`（官方） | R2 兼容 S3 API；功能全（含 Range/ListObjectsV2/DeleteObjects）。服务器端体积可接受 |
| 轻量替代 | `aws4fetch`（零依赖单文件） | 更轻，但需手写签名/Range/翻页，维护面大，不推荐首选 |
| 数据迁移 | `rclone`（S3 backend → R2） | 支持增量/断点/校验，R2 官方文档也推荐；或 `aws s3 sync` + R2 endpoint |
| 环境变量 | `R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET` | 保留 `BLOB_ROOT` 作本地后端 fallback / 双后端 feature flag |
| 依赖新增 | 仅 `@aws-sdk/client-s3` + `rclone`（迁移工具，不进 runtime） | 无新 DB 迁移、无 schema 变更 |

## 4. 实施拆解（预估）

1. **存储层抽象**：`shared/storage.ts` 加后端接口/实现切换（local ↔ r2），按 env 选择；默认向后兼容本地。
2. **R2 实现**：封装 PutObject / GetObject（含 Range）/ DeleteObject / ListObjectsV2（翻页，对齐现有 `listStoragePaths` 语义供孤儿清理）。
3. **getFile 流式**：保留 API 代理 + 签名链接模型；Range 头直接透传给 S3 GetObject，206 逻辑不变。
4. **孤儿清理**：`cleanupOrphanFiles` 的磁盘遍历改用 ListObjectsV2 分页枚举。
5. **env 与 Docker**：加 R2 凭据 env；`/data/blobs` volume 保留作过渡/回滚。
6. **数据迁移**：`rclone` 从服务器 `/data/blobs/objects/**` 同步到 R2（保留 key）；停写窗口或双写后校验数量与 checksum。
7. **测试**：storage 层单测（fake S3 或本地 MinIO）+ 集成测试；迁移演练。
8. **部署回滚**：保留本地后端，feature flag 可秒回滚。

## 5. 工作量与风险评估

- **改动面**：小。单一接缝封装 + 高层业务零改动 + DB 零改动。
- **风险点**：
  - **延迟**：R2 无中国大陆入口，取决于 hpcore（Azure）所在地 —— 若在 HK/海外则 OK；需实测延迟。每次读写多一次网络往返（读写经 API 代理）。
  - **可用性**：从「本地磁盘」变为「依赖 Cloudflare 网络」，需考虑 R2 故障时的回退（保留本地后端即为此准备）。
  - **视频/音频流式**：Range 透传正确性需重点测（正常播放/拖进度/断点续传）。
- **量级**：开发 + 测试约 0.5–2 人日；数据迁移 + 部署演练另计（取决于数据量）。

## 6. 待决决策点

- [ ] AI 会话 jsonl（`/data/sessions`）是否也迁 R2？（当前默认**不迁**，独立 topic）
- [ ] 文件访问是否保持「全走 API 代理」，还是新增「R2 预签名 URL」直连（省 API 带宽/延迟）？—— 隐私优先，倾向保留代理 + 可选预签名。
- [ ] 双后端 feature flag（本地回滚兜底）vs 直接替换（简化代码但回滚靠 git）。

---

## 历次尝试与演化

- （首次提出，无历史）
