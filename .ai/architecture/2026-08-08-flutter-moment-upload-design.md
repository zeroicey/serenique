# Flutter 移动端 — Moment 附件上传（发布）设计 v1（2026-08-08）

状态: **已确认**（待实施）
适用范围: `apps/mobile`（Flutter，iOS 优先）
前置: 显示/预览已上线（`.ai/architecture/2026-08-08-flutter-moment-attachments-design.md` v2）；需求文档 `2026-08-08-mobile-moment-attachments.md`；Web 端参考 `moment-create-page.tsx` + `moment-create-attachment-grid.tsx` + `useCreateMomentWithMedia`。

---

## 1. 后端契约（源码为准，已确认无需改后端）

- **上传**：`POST /api/blobs/upload`（multipart `file`）→ `BlobEntry`（`{id, originalName, mimeType, size, checksum, metadata, width, height, duration, createdAt}`）
- **创建**：`POST /api/moments` `{ text（必填 ≥1 字，≤10000）, attachments: [{blobId, displayName, sortOrder}] }` —— **纯附件不允许，必须带文字**（`CreateMomentSchema.text = z.string().min(1).max(10000)`）
- 上传大小上限 `BLOB_MAX_SIZE`（生产 100MB）；孤儿 blob 由后端 `cleanup-orphans` 兜底（上传成功但创建失败时）

## 2. 交互设计（对齐微信）

**入口（右上角 + 按钮，`app_shell.dart`）**：
- **短按** → 底部弹层（`showModalBottomSheet`）四个选项：
  - 📷 **拍摄** → `image_picker` 相机（`ImageSource.camera`，支持拍照 + 录像切换）
  - 📁 **选文件** → `file_picker`（`FileType.custom` 限定 `image/*, video/*, audio/*`）
  - 🖼️ **从手机相册选择** → `image_picker` 相册（`ImageSource.gallery`，支持多选图/视频）
  - **取消** → 关闭
- **长按** → 直接进入发布页（无附件，纯文字；微信同款）

**流程**：短按 → 选来源 → 选完附件 → **自动进入发布页** → 页面内可继续添加/删除附件、写文字 → 发表。

## 3. 发布页（改造 `MomentCreatePage`）

- 正文 TextField（同现状，`maxLength 10000`）
- 附件区：3 列缩略图网格（复用 `AttachmentGrid` 视觉风格但为本地文件版）：
  - 图片 → `Image.file` 缩略图；视频 → 灰底 + ▶ + 时长；音频 → 图标 + 文件名
  - 每个瓦片右上角 ✕ 删除
  - 末尾「+」瓦片 → 再次弹出来源选择（继续添加，数量不限）
- 发表按钮（右上角）：
  - 校验：`text.trim().isEmpty` → 提示「内容不能为空」（纯附件不允许）
  - 逐个 `uploadBlob` → `createMoment({text, attachments})`
  - **失败保留已选附件**：上传/创建异常 → snackbar 提示 + 附件与正文均保留，可重试
  - 发表中禁用按钮 + spinner

## 4. 依赖与权限

```yaml
image_picker: ^1.x   # 拍摄（拍照/录像）+ 相册多选
file_picker: ^8.x    # 选文件（限定图/视频/音频）
```

Info.plist 新增（iOS）：
- `NSCameraUsageDescription` — 拍摄照片/视频需要访问相机
- `NSPhotoLibraryUsageDescription` — 从相册选择图片/视频
- `NSMicrophoneUsageDescription` — 拍摄视频需要麦克风（iOS 强制要求）

## 5. 文件清单（apps/mobile/lib/）

| 文件 | 职责 |
|------|------|
| `core/network/api_client.dart`（改） | 新增 `postMultipart(path, file)`：`FormData` + `MultipartFile` 上传（带进度可选，v1 不加） |
| `features/moment/moment_api.dart`（改） | `uploadBlob(UploadSource)` → BlobEntry；`create(text, {attachments})` 支持附件 |
| `features/moment/moment_providers.dart`（改） | `MomentActions.createWithMedia(text, files)`：逐个 uploadBlob → create；失败抛错（保留已选由页面持有） |
| `features/moment/moment_create_page.dart`（改） | 附件网格 + 继续添加 + 删除 + 发表编排；`pickedFiles` 状态 |
| `features/moment/widgets/attachment_picker_sheet.dart`（新） | 底部弹层：拍摄/选文件/相册/取消；返回 `PickedAttachment?` |
| `features/moment/widgets/local_attachment_grid.dart`（新） | 本地文件缩略图网格（删除 + 「+」瓦片） |
| `app_shell.dart`（改） | 右上角按钮：短按弹层 / 长按直进发布页 |
| `ios/Runner/Info.plist`（改） | 相机/相册/麦克风权限描述 |

## 6. 数据流

```
[短按 +] → AttachmentPickerSheet
  ├─ 拍摄 → image_picker(camera) → XFile
  ├─ 选文件 → file_picker(custom, image/video/audio) → PlatformFile
  └─ 相册 → image_picker(gallery, multi) → XFile[]
→ push /moments/create（携带已选附件）→ 网格展示（可继续添加/删除）
→ 发表：for each file → uploadBlob → createMoment({text, attachments}) → pop + 列表刷新
```

发布页路由参数：`/moments/create?attachments=...` 不适合传文件对象 → 用 **Riverpod 临时状态 provider**（`pickedAttachmentsProvider`，autoDispose）在弹层与发布页之间传递；纯文字长按进入时为空。

## 7. 测试

- `attachment_picker_sheet_test.dart`：四个选项渲染；点取消返回 null（弹层交互，picker 本身 mock）
- `local_attachment_grid_test.dart`：缩略图渲染/删除/「+」回调
- `moment_create_page_test.dart`（改）：空文字拦截；带附件发表调用 upload+create；失败保留附件
- `moment_api_test.dart`（改）：`create` 带 attachments 请求体正确
- picker 插件在测试中 mock（`image_picker`/`file_picker` 均提供平台接口可注入 fake）

## 8. 明确不做（防回潮）

上传进度条（v1 无）、断点续传、压缩/裁剪、多账号、音频录制。

## 9. 验收

`flutter analyze` 无告警 + `flutter test` 全绿 + 真机（用户在场）：短按弹层 → 拍摄/相册/文件各选一次 → 发布页可继续添加 → 发表成功 → 列表出现新闪记（含附件）→ 长按直进纯文字发布正常。
