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

## 用户真机验证 + 全屏修复（commit 5e8aa0b）

用户真机实测反馈：图片预览不是全屏、顶部有个「header bar」。

- **根因**：`Center(InteractiveViewer(child: Image.network(fit: contain)))` —— InteractiveViewer 收缩包裹，Image 按自身宽高比缩到「宽满屏、高不满」（如 4:3 图在 iPhone 上是 1179×1572），Center 悬浮在屏幕中间 → 上下黑边，顶部黑边里永远显示计数/关闭条，看起来像 header bar。已核实 SDK 3.44 的 `_InteractiveViewerBuilt` 对 `constrained:true` 的 child 不做约束强制。
- **修复**：① `SizedBox.expand` 让图片盒子铺满整页（contain 按整屏计算，捏合/平移覆盖全屏）；② 顶部控制条 2.5s 自动隐藏 + 点按唤出（微信相册样式，`IgnorePointer` + `AnimatedOpacity`）；③ 预览期间 `SystemChrome.setEnabledSystemUIMode(immersiveSticky)` 隐藏状态栏，`dispose` 恢复 `edgeToEdge`。
- **坑**：`SizedBox.expand()` 的 width/height 是 `double.infinity` 不是 null（测试断言写错过一次）；控制条自动隐藏用 `Timer`，测试里必须能 dispose 取消（flutter_test 对 pending timer 会报错）。
- 测试：新增 `media_preview_page_test.dart` 3 例（初始显示→2.5s 隐藏、点按唤出、图片全屏盒子），108/108 全绿。
- **Release 装机**（用户要求，API 用生产）：`flutter build ios --release --dart-define=API_BASE_URL=https://api.zeroicey.me` + `xcrun devicectl device install app --device C11AB076-... build/ios/iphoneos/Runner.app`（流程见 `.ai/runbooks/ios-device-install.md`）。构建 29s、安装成功。

## 第二轮修复：微信式「从小放大」过渡（commit d7691a7）

用户反馈：仍是黑边 + 「跳新页面」感。要微信/小红书式：点缩略图 → 图片从小放大铺满全屏。

- **方案**：① **Hero 共享元素过渡**——网格图片瓦片与预览页图片都用 `Hero(tag: 'blob-<blobId>')` 包裹，点缩略图直接飞入放大；② **`BoxFit.cover`** 铺满全屏（无黑边，比例不匹配时裁边，捏合放大看细节，`minScale: 1.0` 保持铺满）；③ 控制条（关闭+计数）**默认隐藏**，点按唤出后 2.5s 自动隐藏。
- **坑**：`Hero` 内部自带一个 `SizedBox(width: null, height: null)`，测试里 `find.descendant(InteractiveViewer, SizedBox)` 会命中 2 个（自己的 expand + Hero 的 null 盒子）→ 断言要过滤 `width != null` 的；PageView 非当前页的 widget 可能仍在树里（`tester.widget` 单例断言会 "Too many elements"）。
- 测试更新：预览页控制条初始隐藏→点按唤出→自动隐藏；网格导航测试改为先唤出控制条再点关闭。108/108 全绿。

## 第三轮：换用现成组件 photo_view_plus（commit ecc57f6）

用户对自研 Hero 仍不满意，要求用现有方案。调研 pub.dev：`photo_view` 0.15.0（2024 年后不维护）→ 选用维护中的 fork **`photo_view_plus` 1.1.1**（2026-04 更新，API 兼容）。

- **预览页重写为 `PhotoViewGallery`**：图片页 `initialScale: PhotoViewScale.covered`（初始铺满全屏无黑边）+ `minScale: contained`（可捏合缩回看全图）+ 双击放大 + `heroAttributes`（与网格 Hero tag 同源 → 共享元素从小放大过渡）；视频/音频页用 `PhotoViewGalleryPageOptions.customChild` 复用 VideoPlayerView / AudioPlayerBar（`disableGestures: true`）。
- **点按唤出控制条必须走 PhotoView 的 `onTapUp`**：外层 GestureDetector 的 tap 会在手势竞技场输给 PhotoView 的 RawGestureDetector。
- **坑（测试环境）**：
  - PhotoView 的 `DoubleTapGestureRecognizer` 让竞技场保持 **300ms** 才放行 tap → 测试里 tap 后必须 `tester.pump(Duration(milliseconds: 350))`，否则 onTapUp 永不触发。
  - 图片解码是**真实异步**，widget 测试 fake 时钟下永远不完成 → `loadingBuilder` spinner 一直转 → `pumpAndSettle` 超时。解法：`tester.runAsync(() async { pump; await Future.delayed(300ms); pump; })` 后再 pumpAndSettle。**这俩坑以后凡是用 photo_view/带解码的组件测试都会遇到。**
  - `photo_view_plus_gallery.dart` **不 export** 类型（PhotoViewScale/PhotoViewHeroAttributes/PhotoViewComputedScale 在 `photo_view_plus.dart`），要两个 import。
  - Riverpod 3 无 `valueOrNull`，用 `.value`（可空）。
- 108/108 全绿；release 已重装（生产 API）。

## 第四轮：用户不满意，整体退回（commit bd9ae06）

用户对 photo_view_plus 版效果仍不满意（「还是不行」），要求退回移动端功能前基线，**只动 `apps/mobile`**，其他端（API/Web/CLI/MCP）零影响。

- **退回方式**：`git rm -r apps/mobile` + `git checkout 9919a1f -- apps/mobile`（9919a1f = 功能第一个提交 ed11f18 的父提交），一次提交 `bd9ae06 revert(mobile): remove moment attachments preview feature`，19 个文件、-1539 行。
- 验证：`flutter pub get`（pubspec.lock 已回退）+ `flutter analyze` No issues + `flutter test` 91/91（功能前原套件）。
- **保留**：设计文档（`.ai/architecture/2026-08-08-flutter-moment-attachments-design.md`）、需求文档（状态改 ⏳待实施）、本 worklog、实现计划（`docs/superpowers/plans/`）——为下次重做留参考。
- 手机已重装退回后的 release（生产 API）。
- **给下次的提示**：用户要的是微信/小红书式体验——点缩略图从小放大飞入铺满全屏、无黑边、无多余 chrome。自研（Hero+cover）与 photo_view_plus 两版都被否。下次动手前先跟用户对齐一个可接受的最小验收标准（例如：打开动画形式、黑边是否可接受、裁切策略），避免再次返工。测试环境两个坑已在上面记录（runAsync 解码、300ms 双击竞技场）。

## 坑 / 对下一次会话的提示

- **SDD 评审抓出两个 plan 笔误**，均已修正 plan 后修复：① 视频控制条被 `IgnorePointer` 整条包裹 → Slider/全屏按钮不可点（控制条必须可交互，只能让空白区透传）；② 音频重试 `_load()` 未取消旧 stream 订阅 → 每次 retry 泄漏 3 个订阅。**教训：控制条这类"部分区域可点、部分区域透传"的组件，写代码前先想清楚 hit-test 行为；重试路径的资源释放要在计划里写死。**
- `num.clamp` 返回 `num`，喂 `Slider.max`（double）必须 `.toDouble()`。
- `ApiClient` 加了 `apiBase` getter（trim 尾斜杠），媒体 URL 拼接用它（dio 对路径宽容，但媒体 URL 直接走网络层）。
- 上传阶段（下阶段）：`image_picker`（图/视频）+ `file_picker`（音频）→ 逐个 `uploadBlob` → `createMoment({text, attachments})`，编排对齐 Web `useCreateMomentWithMedia`。
- 待做：真机验证清单 = Web 端传图片/视频/音频 → `flutter run -d hpcell --dart-define=API_BASE_URL=http://<Mac局域网IP>:3000` → 网格显示 → 全屏预览滑动/播放/缩放 → 签名链接 1 小时后刷新正常。
