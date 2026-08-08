# Flutter 移动端 — Moment 附件显示/预览设计（2026-08-08）

状态: **已确认，待实施**（预览阶段；上传编排下阶段）
适用范围: `apps/mobile`（Flutter，iOS 优先）
前置: 技术栈见 [[2026-08-06-flutter-mobile-tech-stack]]；Web 端参考实现见 [[2026-08-05-web-moment-feature-design]] 与 `apps/web/src/features/moment/`、`apps/web/src/components/common/media-preview-dialog.tsx`；需求文档 `2026-08-08-mobile-moment-attachments.md`。

---

## 1. 后端契约（源码为准，移动端只消费不修改）

- **附件响应**：Moment entry 内嵌 `attachments[]`，每项含 `{ id, blobId, role, displayName, sortOrder, blob }`；`blob` 含 `{ id, originalName, mimeType, size, width, height, duration, fileUrl }`（`fileUrl = /api/blobs/:id/file` 无签名直链）。
- **签名链接**：`POST /api/blobs/:id/access-link`，body `{ expiresInSeconds }`（默认 15 分钟，上限 7 天）→ `{ path, expires, expiresAt, signature }`，`path` 为 `/api/blobs/:id/file?expires=...&signature=...`。
- **上传（下阶段）**：`POST /api/blobs/upload`（multipart `file`）→ BlobEntry；`createMoment({ text, attachments: [{ blobId, displayName, sortOrder }] })`。

## 2. 关键约束

- `video_player` 不支持自定义请求头 → 媒体加载统一走**签名链接**（凭证在 query，与 Web 同思路）。
- 签名链接 1 小时过期 → 需要缓存 + 过期刷新；失败回退直链（对齐 Web `useBlobAccessUrls` 的 fallback）。
- 后端无缩略图端点 → 列表网格直载原图（`width/height` 元数据可用于布局）。
- 不加磁盘缓存（`cached_network_image`）：签名 URL 失效后磁盘缓存会命中死链接。

## 3. 依赖变更（pubspec.yaml）

```yaml
video_player: ^2.13.0   # 视频播放（官方）
just_audio: ^0.10.6     # 音频播放
```

不加 `chewie` / `cached_network_image` / `photo_view`。下阶段上传再加 `image_picker` / `file_picker`。

## 4. 文件清单与职责（apps/mobile/lib/）

| 文件 | 职责 |
|------|------|
| `features/moment/moment_models.dart`（改） | 新增 `MomentAttachment` / `MomentBlob` 手写模型；`Moment` 加 `attachments` 解析（对齐 API 字段名） |
| `features/moment/moment_api.dart`（改） | 新增 `createBlobAccessLink(blobId)` → 返回完整签名 URL |
| `features/moment/blob_access.dart`（新） | `BlobAccessService`：内存缓存 `Map<blobId, (url, expiresAt)>`；`resolve(blobId)` 未过期直接返回，过期/缺失重新申请；失败回退直链。Riverpod Provider |
| `features/moment/widgets/attachment_grid.dart`（新） | 3 列正方形瓦片网格：图片缩略图 / 视频 ▶ 覆盖层 / 音频图标；>9 折叠「+N 更多」；点击 → 全屏预览页 |
| `features/moment/media_preview_page.dart`（新） | 全屏黑底 `PageView.builder`：顶部 `1/N` + 关闭；图片 `InteractiveViewer` 缩放；视频 `video_player`；音频 `just_audio`；**只初始化当前页播放器，翻页释放上一页** |
| `features/moment/widgets/video_controls.dart`（新） | 手写视频控制条：播放/暂停 + 进度 Slider + 已播/总时长 + 全屏（`SystemChrome`） |
| `features/moment/widgets/audio_player.dart`（新） | just_audio 播放条：播放/暂停 + 进度 + 时长 + 文件名 |
| `features/moment/widgets/moment_card.dart`（改） | 正文下方插入附件网格（朋友圈位置：正文下、时间行上） |
| `features/moment/moment_detail_page.dart`（改） | 正文下方显示附件网格（可点击预览） |
| `router.dart`（改） | 预览页 push 全屏 route（黑背景、无 appBar） |

## 5. 数据流（链接刷新）

```
附件 → 瓦片 ref.watch(blobAccessProvider(id))
  ├─ 缓存命中且未过期 → 直接用
  ├─ 过期/缺失 → POST /api/blobs/:id/access-link（expiresInSeconds: 3600）
  └─ 失败 → 回退 /api/blobs/:id/file 直链
```
内存缓存，app 重启后重拉；与 Web「1 小时 + 5 分钟 stale」同思路（移动端以 expiresAt 为准）。

## 6. 预览页交互细节

- `PageView.builder` + `itemCount = attachments.length`；`onPageChanged` 更新顶部 `N/M` 计数，并释放上一页播放器。
- 图片页：`InteractiveViewer`（捏合缩放）+ 双击放大（可选，v1 只做捏合）。
- 视频页：初始化后 `aspectRatio` 居中，点按显示/隐藏控制条；全屏按钮横屏切换（`SystemChrome.setPreferredOrientations`）。
- 音频页：居中大图标 + 播放条（just_audio）。
- 页面销毁（pop）时 dispose 当前播放器；`video_player`/`just_audio` 均需在 `dispose` 释放，避免后台继续播放/内存泄漏。

## 7. 上传编排（下阶段，设计预留）

对齐 Web `useCreateMomentWithMedia`：选文件（`image_picker` 图/视频 + `file_picker` 音频）→ 本地预览 → **逐个** `uploadBlob` → `createMoment({ text, attachments: [{ blobId, displayName: 文件名, sortOrder: 序号 }] })`。孤儿 blob 由后端 `cleanup-orphans` 兜底。**本次不实现。**

## 8. 测试与验证

- 门禁：`flutter analyze` + `flutter test`（新增测试：模型解析 `attachments`、签名链接缓存过期/刷新逻辑、附件网格 widget 渲染）。
- 端到端验证：Web 端上传图片/视频/音频 → 移动端真机（`flutter run -d hpcell --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000`）查看网格 → 全屏预览 → 左右滑动 → 播放。

## 9. 明确不做（防回潮）

上传与选文件 UI、磁盘缓存、后端缩略图、视频封面帧、音频波形、评论区附件。
