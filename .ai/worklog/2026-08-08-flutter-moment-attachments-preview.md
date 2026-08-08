# 2026-08-08 — Moment 移动端附件显示/预览（Flutter）

用户要求给 Moment 移动端（Flutter）补上附件能力：Web 端已有完整附件（上传/网格/全屏预览），移动端先做**显示与预览**（不做上传）。调研后确认关键约束：官方 `video_player` 不支持自定义请求头 → 媒体加载必须走后端签名链接（`POST /api/blobs/:id/access-link`，与 Web 端同思路）。设计定稿后按 SDD 分 10 个任务实现，每个任务独立子代理实现 + 任务评审。

## 改动（commit ed11f18..2dd5eeb，共 14 个提交）

- **apps/mobile 依赖**：`video_player ^2.13.0`、`just_audio ^0.10.6`；dev 依赖 `mocktail_image_network ^1.3.0`（注意：1.3.0 的 API 是 `mockNetworkImages`，**不是** `mockNetworkImagesFor`）
- **模型层**（`features/moment/moment_models.dart`）：新增 `MomentBlob`/`MomentAttachment`（`isImage/isVideo/isAudio/displayLabel`），`Moment.attachments` 默认 `const []`（旧数据/旧测试兼容）
- **签名链接缓存**（`features/moment/blob_access.dart` + `moment_api.dart` + `moment_providers.dart`）：纯 Dart `BlobAccessService`（内存缓存 + `expiresAt` 过期刷新 + 失败回退直链）；`blobAccessUrlProvider` = `FutureProvider.autoDispose.family`（瓦片离开屏幕自动释放）
- **附件网格**（`widgets/attachment_grid.dart`）：3 列正方形瓦片，>9 折叠「+N 更多」；图片缩略图 / 视频 ▶+时长 / 音频图标+文件名
- **全屏预览页**（`media_preview_page.dart`）：黑底 `PageView` 左右滑动 + 顶部关闭/`1/N` 计数；图片 `InteractiveViewer` 缩放；视频 `widgets/video_player_view.dart`（手写控制条：点按显隐、播放/暂停、进度、全屏横竖屏）；音频 `widgets/audio_player_bar.dart`（just_audio 播放条）
- **接线**：列表卡片与详情页正文下插入网格（`widgets/moment_card.dart`、`moment_detail_page.dart`）
- **测试**：新增模型解析、缓存命中/过期/回退、时长格式化、网格渲染/折叠、瓦片→预览导航共 9 个用例

## 验证

- `flutter analyze`：No issues found
- `flutter test`：105/105 全绿（原 96 + 新增 9）
- 设计文档：`.ai/architecture/2026-08-08-flutter-moment-attachments-design.md`；需求：`.ai/requirements/2026-08-08-mobile-moment-attachments.md`（上传下阶段）
- **真机验证待做**（见下）

## 坑 / 对下一次会话的提示

- **SDD 评审抓出两个 plan 笔误**，均已修正 plan 后修复：① 视频控制条被 `IgnorePointer` 整条包裹 → Slider/全屏按钮不可点（控制条必须可交互，只能让空白区透传）；② 音频重试 `_load()` 未取消旧 stream 订阅 → 每次 retry 泄漏 3 个订阅。**教训：控制条这类"部分区域可点、部分区域透传"的组件，写代码前先想清楚 hit-test 行为；重试路径的资源释放要在计划里写死。**
- `num.clamp` 返回 `num`，喂 `Slider.max`（double）必须 `.toDouble()`。
- `ApiClient` 加了 `apiBase` getter（trim 尾斜杠），媒体 URL 拼接用它（dio 对路径宽容，但媒体 URL 直接走网络层）。
- 上传阶段（下阶段）：`image_picker`（图/视频）+ `file_picker`（音频）→ 逐个 `uploadBlob` → `createMoment({text, attachments})`，编排对齐 Web `useCreateMomentWithMedia`。
- 待做：真机验证清单 = Web 端传图片/视频/音频 → `flutter run -d hpcell --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000` → 网格显示 → 全屏预览滑动/播放/缩放 → 签名链接 1 小时后刷新正常。
