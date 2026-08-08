# 2026-08-08 — Moment 移动端附件重做（遮罩式预览）成功 + HCYJ 反代适配

用户对首版附件预览（Hero/photo_view_plus/新页面跳转）整体退回后，本轮按「先非 UI 后 UI、先图片 MVP 后其他」分阶段重做。**用户真机验收通过**（评价明显优于上一版），并切换国内 HCYJ 加速入口。全程用 SDD（子代理驱动开发）+ 每任务独立评审。

## 阶段一：非 UI 层（API 模型 + 签名链接缓存）

- **模型**（`moment_models.dart`）：新增 `MomentBlob`/`MomentAttachment`（`isImage/isVideo/isAudio/displayLabel`），`Moment.attachments` 默认 `const []`；`isImage` 等按 mimeType 前缀判断（通用，后续加类型只扩展判断）
- **API**（`moment_api.dart`）：`createBlobAccessLink(blobId)` → `BlobAccessLink(url, expiresAt)`
- **缓存**（`blob_access.dart`，纯 Dart 可单测）：`BlobAccessService` 内存缓存 `Map<blobId, link>` + `expiresAt` 过期刷新 + 失败回退直链；`blobAccessUrlProvider` = `FutureProvider.autoDispose.family`
- 单测 9 例（模型解析、缓存命中/过期/刷新/回退）

## 阶段二：UI（本轮核心，按用户新交互重做）

- **缩略图网格**（`widgets/attachment_grid.dart`）：3 列正方形瓦片，>9 折叠前 8 + 第 9 格「+N 更多」就地展开（对齐 Web `moment-attachment-grid.tsx`）；图片瓦片直载签名链接原图，视频 ▶+时长、音频图标+文件名
- **全屏预览**（`media_preview.dart`）：**`showGeneralDialog` + 黑底 + 150ms FadeTransition 淡入——当前页面之上盖遮罩，绝不 push 新页面**（这是本轮与首版的分水岭，用户明确要求）；`PageView.builder` 左右滑动 + 底部居中 `1/N` 计数；图片页 `InteractiveViewer(minScale:1,maxScale:4)` + `SizedBox.expand(Image.network(contain))`（初始整图在屏内、捏合放大、无黑边坑）；视频/音频居中占位（图标+时长/文件名）；**点图片关闭，无叉叉**（微信逻辑）
- **接线**：列表卡片正文下方、详情页正文下方插网格，点瓦片 `showMediaPreview(initialIndex: 瓦片序号)`
- 最终评审修复：`sortedAttachments` 纯函数（sortOrder,createdAt,id 稳定排序，网格与预览用同一有序来源防点错图）；预览占位图标 `Colors.white70`（黑底上浅色主题的 onSurfaceVariant 不可见）
- 计数间距：`padding.bottom + 16 → +32`（用户反馈计数下方紧贴系统 Home Indicator 横条，拉开后 OK）

## 阶段三：HCYJ 国内加速入口 + 路由反代适配（关键坑）

- 移动端 baseUrl 切 `https://api.hcyj.xyz/serenique`（hcyj Caddy `handle_path` 路由反代 → EasyTier → hpcore）
- **坑：签名链接 url 丢前缀**。`POST /api/blobs/:id/access-link` 返回的 `url` 是后端用**它看到的 request origin** 拼的（`https://api.hcyj.xyz`，不含 `/serenique`）——路由反代剥离前缀后转发，后端根本不知道有前缀。移动端若直接用 `url` → 404（落到 Caddy 默认 handle 小程序后端）
- **修法**：改用后端返回的**相对 `path`** + 客户端 `apiBase` 拼接（对齐 Web `resolveApiPath` 思路）：`'${client.apiBase}$path'`。补 2 个守护测试（含/不含前缀两场景）
- 其他无需适配：请求路径（dio baseUrl 天然带前缀）、失败回退直链（`apiBase + fileUrl`）、token（共享秘密，入口无关）

## 验证

- `flutter analyze` 无告警；`flutter test` 119/119 全绿（基线 100 + 新增 19）
- 真机（iPhone 15 Pro）：`flutter build ios --release --dart-define=API_BASE_URL=https://api.hcyj.xyz/serenique` + `xcrun devicectl device install app --device C11AB076-...` → **用户验收通过**，国内访问 ~60ms 快（旧 api.zeroicey.me 直连 1.5–5.7s）
- 需求文档状态更新为 ✅已实施

## 坑 / 对下一次会话的提示

- **路由反代（handle_path 剥前缀）+ 后端拼绝对 URL 的接口**：客户端一律用相对 path + 自己的 baseUrl 拼接，别用服务端返回的完整 url。Web `resolveApiPath` 是标准解法。
- **SDD 流程**：任务 0（上阶段非 UI 改动）当时没提交，评审 I1 发现后补交并 rebase 重排历史。教训：**跨会话的分阶段工作，阶段结束时先提交再进下阶段**。
- **Flutter 3.44 widget 测试**：`Image.network` 解码是引擎异步，fake-async 下 `pumpAndSettle` 永远超时 → 用 `runAsync` 真实延时 + 交替 pump 的 `settle()` helper（4 个测试文件重复定义了，应抽 `test/helpers.dart`）。
- **Dart `List.sort` 不稳定**：仅按 sortOrder 排序 + 多处独立排序 = 顺序漂移风险；稳定排序要带 createdAt/id 次键。
- 预览页占位图标在黑底上用 `Colors.white70`（浅色主题的 onSurfaceVariant 是深色，黑底上看不见）。
- 下一步（下阶段）：视频 `video_player` / 音频 `just_audio` 播放、上传编排（`image_picker`/`file_picker` → `uploadBlob` → `createMoment({text,attachments})`）、「从小放大」动画（换 transitionBuilder + Hero tag）。
