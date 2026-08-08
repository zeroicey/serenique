# Moment 移动端附件需求文档

- 日期：2026-08-08
- 状态：✅已实施（2026-08-08 显示/预览 MVP 已上线真机验收通过；上传下阶段。实现记录：`.ai/worklog/2026-08-08-flutter-moment-attachments-ui-mvp.md`；重做经历：首版被退回 `bd9ae06`，见本文件历次尝试记录）
- 范围：`apps/mobile`（Flutter，iOS 优先）—— Moment 附件**显示与播放**（已退回）、**上传**（下阶段）
- 前置记录：`2026-08-06-flutter-mobile-tech-stack.md`（移动端技术栈）、`2026-08-05-web-moment-feature-design.md`（Web 端参考实现）
- 历次尝试与坑：`.ai/worklog/2026-08-08-flutter-moment-attachments-preview.md`

---

## 1. 背景与目标

Moment 移动端目前只支持纯文字。Web 端已有完整附件能力（上传 / 网格展示 / 全屏预览），移动端需要补齐，做到「朋友圈式」体验：

- **显示**：列表卡片与详情页展示附件（图片 / 视频 / 音频三种类型）。
- **预览**：点击进入全屏预览，可左右滑动切换上一张 / 下一张；图片可缩放，视频、音频可播放。
- **上传**（下阶段）：新建 Moment 时选图 / 视频 / 音频并上传。

后端契约（`services/api` 源码为准）已具备全部能力，移动端无需后端改动：附件内嵌 `attachments[].blob`（含 `mimeType/width/height/duration`），文件访问走签名链接 `POST /api/blobs/:id/access-link`，上传走 `POST /api/blobs/upload`。

## 2. 关键约束（调研结论）

| # | 约束 | 结论 |
|---|------|------|
| ① | `video_player` 官方插件**不支持自定义请求头** | 不能走 Bearer token 加载媒体，**必须用签名链接**（凭证在 query），与 Web 端同思路 |
| ② | 签名链接会过期 | 需要「链接缓存 + 过期刷新」机制（对齐 Web `useBlobAccessUrls`：1 小时过期、短时缓存） |
| ③ | 后端无缩略图端点 | 列表网格直接加载原图（对齐 Web 现状），后续需要再补 |
| ④ | 签名 URL 磁盘缓存会缓存失效链接 | 不加 `cached_network_image`，仅内存缓存 |

## 3. 技术选型（已定）

| 项 | 选择 | 说明 |
|----|------|------|
| 图片显示/缩放 | 内置 `Image.network` + `InteractiveViewer` | 零新依赖 |
| 视频播放 | `video_player ^2.13.0`（官方） | iOS 13+，ATS 明文例外已配好 |
| 视频控制条 | **手写轻量控制条** | 播放/暂停 + 进度 + 时长 + 全屏；不引 chewie |
| 音频播放 | `just_audio ^0.10.6` | URL 流式播放 |
| 左右滑动 | 内置 `PageView.builder` | 只初始化当前页播放器，翻页释放 |
| 选文件（下阶段） | `image_picker`（图/视频）+ `file_picker`（音频） | 技术栈文档 §9 已预留 |

## 4. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 文件访问方式 | 签名链接（`/api/blobs/:id/access-link`），缓存 + 过期刷新，失败回退直链 |
| ② | 视频控制条 | 手写轻量控制条（零新依赖） |
| ③ | 列表缩略图 | 直载原图（后端无缩略图端点，对齐 Web） |
| ④ | 磁盘缓存 | 不加（签名 URL 会缓存失效链接） |
| ⑤ | 预览交互 | 全屏黑底 `PageView`，顶部 `1/N` + 关闭；图片缩放、视频/音频可播放 |
| ⑥ | 上传编排（下阶段） | 对齐 Web `useCreateMomentWithMedia`：逐个 `uploadBlob` → `createMoment({text, attachments})`；孤儿 blob 由后端 `cleanup-orphans` 兜底 |
| ⑦ | 本次范围 | 只做显示/预览；不加选文件 UI、不做上传 |

## 5. 明确不做（防回潮）

上传、选文件 UI、磁盘缓存、后端缩略图、视频封面帧、音频波形、评论区附件。
