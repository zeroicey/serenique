# 素材库模块（Web 端）

- 日期：2026-08-21
- 状态：📝需求讨论中（已定方向，未实施）
- 范围：`apps/web`（页面 + 接入层）、`services/api`（blob 模块小增强）
- 相关：`.ai/requirements/2026-08-20-object-storage-r2.md`、`.ai/decisions/2026-08-04-blob-storage-module.md`

---

## 1. 背景与定位

用户提出：前端需要一个「素材库」模块，用于**查看对象存储（R2）里存的所有文件**，对象存储中的文件都可在此预览。

查证结论（2026-08-21）：

- 记忆库（`.ai/requirements/`、`.ai/archive/`、context-mode）**无素材库历史需求文档**；既有文档只覆盖对象存储迁移与 blob 存储层设计，未提「素材库」前端概念。
- 后端概念中「素材」= blob 模块，**浏览/预览/删除能力基本已齐**：
  - `GET /blobs` — 分页列表 + mimeType 前缀过滤
  - `GET /blobs/:id/file` — Range 流式（视频/音频拖放基础）
  - `POST /blobs/:id/access-link` — HMAC 签名直链（跨站 `<img>`/`<video>` 加载正解）
  - `DELETE /blobs/:id` — 已含引用保护：有 `blob_attachments` 引用时抛 409
  - `GET /blobs/:id/attachments` — 查引用方列表
- 前端 `features/blob/` 已建好接入层（`api.ts` 上传、`access.ts` 签名直链 + 缓存、`queries.ts`），但 **components/ 与 pages/ 为空**；sidebar「素材库」入口存在，`/files` 路由指向占位页。

## 2. 已定方向（用户确认）

| 项 | 决定 |
| --- | --- |
| 模块定位 | **纯浏览管理**：查看所有文件 + 预览 + 删除；不做手动上传入口、不做取用型素材池（后续可加） |
| 删除策略 | **阻止 + 提示引用方**：被 `blob_attachments` 引用的文件禁止删除，提示引用方 |
| 预览范围 | **仅图片**：图片网格预览（签名直链）；视频/音频/PDF 等其他类型只显示元数据卡片，不预览 |

## 3. 设计要点

### 后端（小改动，无 DB 迁移）

1. `GET /blobs` 列表项增加 `refCount: number`（join `blob_attachments` 计数），前端网格可显示「在用」标记。
2. `DELETE /blobs/:id` 的 409 阻止逻辑**已存在**，无需改动；前端删除前调 `GET /blobs/:id/attachments` 预查引用方，有则展示提示并禁用删除。

### 前端（主工作量）

- `features/blob/api.ts` 补 `listBlobs({ page, pageSize, mimeType })` 封装；`BlobEntry` 类型补 `refCount`。
- `features/blob/queries.ts` 补 `useBlobList`（queryKey 含页码/筛选）、`useDeleteBlob`（成功后 invalidate）、`useBlobAttachments(blobId)`（删除弹窗打开时懒查）。
- `features/blob/pages/` 新建素材库页，替换 `/files` 占位路由：
  - 顶部类型筛选 Tab（全部/图片/视频/音频/其他，`list` 的 mimeType 前缀过滤已支持）
  - 网格卡片：图片 → 签名直链 `<img loading="lazy">`（复用 `useBlobAccessUrls` 会话级缓存）+ 点击全屏灯箱；非图片 → 图标 + 原文件名 + 大小 + MIME（+ 时长/尺寸元数据）
  - 删除流程：点击删除 → 查该 blob 引用 → 有引用：弹窗列出引用方（ownerType 中文名 + 数量）禁删；无引用：确认后 DELETE + toast + invalidate
  - 分页：无限滚动或「加载更多」（pageSize ~48，网格布局）
- 路由：`router.tsx` `/files` 从占位页切到素材库页。

## 4. 边界与不做的事（当前迭代）

- 不做手动上传入口（素材只能经业务模块上传产生）
- 不做取用型素材池（插入到闪记/日记）
- 不做视频/音频/PDF 预览（后续可加，`getFile` Range 流式已具备基础）
- 不做文件名/内容搜索（`list` 无 keyword 参数；如需要后端加）
- 不做缩略图服务（个人工具直接拉原图）
- 不涉及移动端（若要做，Flutter 端已有 `blob_access.dart` 直链语义可复用）

## 5. 风险与注意

- ⚠️ `BlobEntry` 前后端各自手工定义（web 不 import api 类型），加 `refCount` 需两边同步；注意 `exports.ts` 导出面契约（若 blob schema 被导出则需同步）
- ⚠️ access-link 按 blobId 逐个申请，分页 48 张图 ≈ 48 个请求；靠会话级缓存缓解，量级可接受（后续可做批量签发）
- 引用方 ownerId 前端无法直接翻译成业务名称（列表接口不带业务详情），提示文案用 ownerType 中文名 + 数量即可，不做跳转
