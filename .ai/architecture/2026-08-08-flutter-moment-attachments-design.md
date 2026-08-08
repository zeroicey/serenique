# Flutter 移动端 — Moment 附件显示/预览设计 v2（2026-08-08，MVP 重做版）

状态: **✅已实施**（2026-08-08 显示/预览 MVP 真机验收通过；上传下阶段。实现记录：`.ai/worklog/2026-08-08-flutter-moment-attachments-ui-mvp.md`）
适用范围: `apps/mobile`（Flutter，iOS 优先）
前置: 技术栈见 [[2026-08-06-flutter-mobile-tech-stack]]；Web 端参考实现 `apps/web/src/features/moment/components/moment-attachment-grid.tsx`、`apps/web/src/components/common/media-preview-dialog.tsx`；需求文档 `2026-08-08-mobile-moment-attachments.md`；退回复盘 `.ai/worklog/2026-08-08-flutter-moment-attachments-preview.md`。

---

## 1. 本轮用户核心诉求（与首版的分歧点）

首版（Hero 过渡 / photo_view_plus / push 新页面）被否的根因：**预览是「跳到新页面」，体验割裂**。本轮明确要求：

- 点缩略图 → **在当前页面之上盖全屏遮罩**（不 push 新页面、无向左滑动的新页面过渡）。
- 动画：从小放大最理想；做不了就**淡入闪一下**直接全屏（MVP 只做淡入）。
- 多图左右滑动切换；底部显示 `1 / N` 计数（用户已确认要）。
- 图片缩放：初始 contain 整图在屏内，可捏合放大（长宽不超屏幕，用户自行放大）。
- 关闭：**无叉叉**，再点一下图片关闭（微信逻辑）；缩回动画 MVP 不做。
- 视频/音频：**只做占位**，播放下阶段。
- 缩略图网格：>9 张时前 8 张 + 第 9 格「更多」，点「更多」就地展开显示全部（对齐 Web 算法）。
- 网格同时出现在**列表页**与**详情页**。

## 2. 技术选型（已定）

| 项 | 选择 | 说明 |
|----|------|------|
| 预览载体 | `showGeneralDialog` + 自定义 `FadeTransition`（150ms 淡入，无滑动） | 全屏黑底遮罩盖在当前页之上；后续加「从小放大」只需换 transitionBuilder，组件不动 |
| 图片显示 | `Image.network` + `InteractiveViewer` | 初始 `BoxFit.contain` + `SizedBox.expand`（防黑边坑），捏合缩放 |
| 左右滑动 | 内置 `PageView.builder` | 只初始化当前页；`onPageChanged` 更新计数 |
| 网格 | `GridView` 3 列 + `needsExpand` 折叠算法 | 对齐 Web `moment-attachment-grid.tsx` |
| 链接 | 已完成 `blobAccessUrlProvider`（内存缓存 + 过期刷新 + 失败回退直链） | 图片/视频/音频通用 |
| 依赖 | 零新依赖 | 本阶段不加 photo_view / video_player / just_audio |

## 3. 文件清单与职责（apps/mobile/lib/）

| 文件 | 职责 |
|------|------|
| `features/moment/widgets/attachment_grid.dart`（新） | 3 列缩略图网格；>9 折叠「+N 更多」就地展开；图片/视频/音频瓦片区分；点击回调 `onTapTile(index)` |
| `features/moment/media_preview.dart`（新） | `showMediaPreview(context, attachments, initialIndex)`：黑底淡入遮罩；`PageView.builder` + 底部 `1/N` 计数；图片 `InteractiveViewer`；视频/音频占位页；点图片关闭（无叉叉） |
| `features/moment/widgets/moment_card.dart`（改） | 正文下方、时间行上方插入网格（朋友圈位置） |
| `features/moment/moment_detail_page.dart`（改） | 正文下方插入网格 |
| 已完成（上阶段）：`moment_models.dart` / `moment_api.dart` / `blob_access.dart` / `moment_providers.dart` | 附件模型 + 签名链接缓存，直接复用 |

## 4. 网格算法（对齐 Web）

```
needsExpand = attachments.length > 9
display = needsExpand && !expanded ? 前 8 张 : 全部
渲染：display 瓦片 + （needsExpand && !expanded 时）第 9 格「+N 更多」
点「更多」→ expanded = true，就地展开全部
```

瓦片规格：正方形（aspect 1:1）、圆角、gap ≈ 2-4。图片瓦片 `Image.network(签名链接)` + loading spinner + error 灰底图标；视频瓦片灰底 + ▶ + 时长（mm:ss）；音频瓦片图标 + 文件名。

## 5. 预览交互细节

- `showGeneralDialog`：`barrierColor: Colors.black`、`barrierDismissible: false`（关闭只走点图片）、`transitionBuilder: FadeTransition`（150ms）。
- `PageView.builder`：`onPageChanged` 更新 `_currentIndex`；底部 `SafeArea` 内居中「`$currentIndex+1 / $total`」半透明白字。
- 图片页：`GestureDetector(onTap → pop)` 包 `InteractiveViewer(minScale: 1, maxScale: 4)`，child `SizedBox.expand(Image.network(fit: contain))` —— 初始整图在屏内，捏合放大；轻点关闭（tap 在手势竞技场输给 pan/scale，拖动不误关）。
- 视频/音频页：居中占位（大图标 + 文件名），点按关闭。
- 加载中/失败：spinner / 灰底图标（复用网格的展示逻辑，预览页同样处理）。

## 6. 数据流

```
网格瓦片 → ref.watch(blobAccessUrlProvider(blobId))
  ├─ 缓存命中且未过期 → 直接用
  ├─ 过期/缺失 → POST /api/blobs/:id/access-link（3600s）
  └─ 失败 → 回退 /api/blobs/:id/file 直链
```

内存缓存 app 重启后重拉；autoDispose provider 瓦片离开屏幕释放，服务层缓存保留（不过期不重发）。

## 7. 测试

- `attachment_grid_test.dart`：1 张/3 张正常渲染；>9 折叠显示前 8 + 「更多」；点「更多」展开全部；瓦片点击回调携带正确 index。
- `media_preview_test.dart`：打开后显示 `1/N` 计数；左右滑动切换更新计数；点图片关闭；图片页存在 InteractiveViewer；视频/音频页显示占位。
- 图片加载 mock：`mocktail_image_network` 的 `mockNetworkImages`（**不是** `mockNetworkImagesFor`，1.3.0 API）。
- 门禁：`flutter analyze` + `flutter test` 全绿。

## 8. 明确不做（防回潮）

从小放大的开合动画（只淡入）、视频/音频播放、磁盘缓存、后端缩略图、上传与选文件 UI、预览页顶部关闭按钮（无叉叉）。

## 9. 下阶段预留

- 「从小放大」开合动画：替换 `transitionBuilder` + Hero tag（网格瓦片与预览页同 tag）。
- 视频播放：`video_player` 换掉占位页；音频 `just_audio`。签名链接与加载链路已就绪。
- 上传编排：`image_picker`/`file_picker` → `uploadBlob` → `createMoment({text, attachments})`。

## 10. 已实施补充（2026-08-08）

- **计数间距**：底部计数 `bottom: padding.bottom + 32`（+16 时紧贴系统 Home Indicator 横条）。
- **HCYJ 路由反代适配**：`createBlobAccessLink` 用相对 `path` + `apiBase` 拼接（后端返回的绝对 `url` 在 `handle_path` 反代下丢 `/serenique` 前缀 → 404）。详见 `.ai/runbooks/cn-access-hcyj.md`。
- **稳定排序**：`sortedAttachments`（sortOrder, createdAt, id）供网格与预览共用，防重复 sortOrder 时点错图。
