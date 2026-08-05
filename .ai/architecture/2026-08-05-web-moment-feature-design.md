# Web 前端 — App 壳层 + Moment 模块设计（2026-08-05）

状态: **已确认，待实施**
适用范围: `apps/web`（Serenique 浏览器端前端）
前置: 技术栈与目录见 [[2026-08-05-web-frontend-tech-stack]] / [[2026-08-05-web-frontend-architecture]]；本次设计基于这两个文档的既有骨架。
设计参考: 旧项目 `serenique-test/apps/web`（侧边栏 / 顶栏 / 动态导航 / Moment 的**布局与组件构成**，UI 观感对齐）。

---

## 1. 已确认决策（用户拍板）

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 代码位置 | 当前仓库 `serenique/apps/web`；旧项目 `serenique-test/apps/web` 仅作设计参考 |
| ② | Moment 范围 | **仅文本 + 附件**。评论 / 标签 API 后端尚未实现（需求文档标记「待实施」），本次不做 |
| ③ | 首页（`/`） | 极简欢迎页（品牌 + 模块入口卡片，占位后续丰富） |
| ④ | 列表加载 | **滚动自动加载**（IntersectionObserver + page 递增） |
| ⑤ | 动态导航栏 | **方案 A：路由 `handle` 驱动**（`useMatches()` 读取 `handle.nav`），feature 自提供导航组件 |
| ⑥ | 媒体类型 | 图片 / 视频 / 音频（对齐旧项目白名单） |
| ⑦ | 主题切换 | **不做**切换按钮，跟随系统（scaffold 已配 next-themes） |
| ⑧ | 文案 | **删除 `messages/`**，中文文案直接写在对应页面/组件内，不集中不导入 |
| ⑨ | 缺失的 shadcn 组件 | 优先 `bunx shadcn add`；base-nova 风格不提供的手写自建；不确定的部分查询官方文档 |

---

## 2. 与架构文档的差异（需同步更新）

`2026-08-05-web-frontend-architecture.md` 硬约束第 4 条「用户可见文案一律经 `messages/`，不散落字符串」**被用户决策 ⑧ 覆盖**：

- 删除 `src/messages/` 目录。
- `src/api/errors.ts` 的 `messages.error.unknown` 改为内联 `"发生未知错误"`。
- `src/app/layout/app-layout.tsx`（将重写）不再引用 messages。
- 实施时同步更新架构文档，删除该硬约束并注明原因（个人应用、文案随组件走、后续如需 i18n 再抽层）。

---

## 3. App 壳层（基础架构）

### 3.1 布局 `app/layout/app-layout.tsx`（改造现有壳层）

```
[useSidebarStore] 折叠状态（zustand，仅 UI 状态）
<div className="flex h-screen w-screen overflow-hidden">
  <AppSidebar />                        ← 左栏
  <div className="flex flex-col flex-1 overflow-hidden">
    <AppNavbar />                       ← 顶栏（折叠按钮 + 分隔线 + 动态导航槽）
    <main className="flex-1 overflow-auto px-1 py-4"><Outlet /></main>
  </div>
</div>
```

对齐旧项目 `module-layout.tsx` 的骨架：侧边栏 +（顶栏 + 内容区）。移动端由侧边栏折叠/抽屉兜底（`useIsMobile` 判断，非本次重点）。

### 3.2 侧边栏 `components/common/app-sidebar.tsx`

优先尝试 `bunx shadcn add sidebar`；若 base-nova 风格不提供（工作日志记录过 add 的坑），手写轻量版，观感对齐旧项目 `app-sidebar.tsx`：

- **头部**：品牌区（无 logo 资源 → 文字 "Serenique"，加粗）+ 横向分隔线。
- **导航区**：仅 **Moment** 一项（`FileText` 图标 + 文字，`NavLink` active 高亮）。
- **可折叠**：全宽 ↔ 图标模式（折叠按钮在顶栏）。只有一项导航时折叠态意义不大，但保留能力，后续加模块即用。
- **无用户区**：新项目无用户/鉴权概念，省略旧项目 `UserItem`（登录用户菜单）。底部留空（后续可放主题切换/版本号）。

### 3.3 导航栏 `app/layout/app-navbar.tsx`

- 结构：`SidebarTrigger`（折叠按钮）+ 竖分隔线 + `<NavSlot/>`。
- `<NavSlot/>`：`useMatches()` 取最深层匹配的 `handle.nav`，有则渲染，无则渲染空（或品牌名占位）。
- 顶栏高度、边框、间距对齐旧项目（`h-16 border-b px-4`）。

### 3.4 路由 `app/router.tsx`（改造）

```
/                  → WelcomePage（lazy）
/moment            → MomentListPage（lazy）   handle.nav = <MomentListNav/>
/moment/create     → MomentCreatePage（lazy） handle.nav = <MomentCreateNav/>
*                  → NotFoundPage（占位）
```

所有页面 `React.lazy` + `<Suspense>` 包裹（架构文档硬约束）。导航组件随路由注册，feature 内提供。

### 3.5 欢迎页 `app/pages/welcome-page.tsx`

极简：品牌名 + 一句描述 + Moment 模块入口卡片（点击 → `/moment`）。风格与整体一致，占位性质。归属 `app/`（应用级 landing，非业务 feature）。

> **目录树扩展**：新增 `app/pages/` 目录放置应用级页面（欢迎页、404 等）。架构文档目录树的 `app/` 下原只有 `providers/router/layout`，此为补充，不属于业务 feature。

---

## 4. Moment feature（`features/moment/`）

### 4.1 文件清单与职责

| 文件 | 职责 |
|------|------|
| `api.ts` | 类型（`MomentEntry` / `MomentAttachmentEntry` / `MomentBlobEntry`）+ Ky 请求：`listMoments`、`createMoment`、`deleteMoment`、`removeMomentAttachment` |
| `queries.ts` | `useMoments`（无限滚动）、`useCreateMoment`、`useDeleteMoment`、`useRemoveMomentAttachment`、`useCreateMomentWithMedia`（编排上传→新建） |
| `schemas.ts` | RHF + zod：`text` 必填 ≤500 |
| `components/` | `moment-list`、`moment-item`、`moment-attachment-grid`、`moment-create-attachment-grid`、`moment-nav`（列表页导航）、`moment-create-nav`（新建页导航） |
| `pages/` | `moment-list-page`、`moment-create-page` |
| `index.ts` | barrel：暴露 pages + 必要 hooks |

### 4.2 API 契约（对齐 `services/api` 现状）

```
GET    /api/moments?page=&pageSize=      → { items: MomentEntry[], total }
POST   /api/moments                       → { text, attachments: [{ blobId, role?, displayName?, sortOrder? }] }
GET    /api/moments/:id
DELETE /api/moments/:id                   → 204
POST   /api/moments/:id/attachments       → { blobId, ... }
DELETE /api/moments/:id/attachments/:id   → 204
POST   /api/blobs/upload                  → multipart，字段 file → BlobEntry
GET    /api/blobs/:id/file                → 文件本体（attachment.blob.fileUrl 已给出相对路径）
```

`MomentEntry`：`{ id, text, attachments[], createdAt, updatedAt }`；附件内嵌 `blob`（含 `fileUrl`、`mimeType`、`width/height`）。类型**手动定义**（不 import `@serenique/api`）。

### 4.3 跨 feature 复用

`features/blob/api.ts` + `features/blob/queries.ts`：提供 `useUploadBlob`（`POST /api/blobs/upload`，60s 超时）。moment 从 blob import（对齐架构文档「blob 的 hooks 被 diary/moment 使用」）。

### 4.4 通用媒体预览 `components/common/media-preview-dialog.tsx`

全屏图片 / 视频 / 音频预览 + 上一张 / 下一张切换 + 类型兜底图标。入参为通用 `MediaFile[]`（无 moment 业务逻辑），放 common 供 blob/diary 后续复用。

### 4.5 草稿 `stores/moment-draft.ts`

zustand：新建页 textarea 草稿，中途返回不清空（对齐旧项目）。

---

## 5. 关键流程

### 5.1 新建（blob 先行）

1. 选文件 → object URL 本地预览（移除时 revoke）。
2. 点「发布」：**逐个** `uploadBlob(file)`（→ `blobId`）→ `createMoment({ text, attachments: [{ blobId, displayName: 文件名, sortOrder: 序号 }] })`。
3. 成功：清草稿 + toast「闪念发布成功」+ 跳回 `/moment`。
4. 失败：toast 报错，不建 Moment。

**孤儿 blob**：文件已上传但 Moment 未建成 → 产生未挂接 blob，可接受（后端有 `cleanup-orphans` 端点）。优于「先建空 Moment 再传」——避免空 Moment 与半成品。

### 5.2 列表（滚动自动加载）

`useInfiniteQuery`，`initialPageParam: 1`，`getNextPageParam` 按「本页是否满页」推进；列表底部 `IntersectionObserver` 哨兵 → `fetchNextPage`；抓取中显示底部 spinner。加载态 spinner、空态（旧项目同款图标+文案）、错误态页面兜底（重试按钮）。

### 5.3 删除

下拉菜单（`MoreHorizontal`）→ 确认对话框 → `deleteMoment` → invalidate `['moments']`。

### 5.4 Moment 卡片（对齐旧项目 `MomentItem`）

- 文本：>150 字截断 + 「展开/收起」。
- 附件网格：3 列，图片/视频（`fileUrl` 直读，`width/height` 布局），>9 折叠显示「+N 更多」，点击 → 媒体预览。
- 底部信息：创建时间（`MM-DD HH:mm`）+ 字数。
- 操作：下拉菜单 → 删除（**无评论**，见决策 ②）。
- 列表卡片居中：`max-w-[600px]`，卡片间分隔线（对齐旧项目）。

---

## 6. 错误处理 / 测试 / 文案

- **文案**：直接写在对应组件/页面（决策 ⑧），不集中、不导入。
- **错误**：mutation 失败统一 sonner Toast；query 错误页面层兜底。
- **测试**（Vitest + RTL，复用 `test/helpers.tsx` 的 `renderWithProviders`）：
  - `moment-item`：截断逻辑、删除确认、时间格式。
  - `moment-create-page`：表单校验（空文本禁发布）、发布流程（mock api，校验 blob→create 调用顺序）。
  - `useMoments`：mock api，校验 page 递增与满页判断。
  - `media-preview-dialog`：上一张/下一张切换。

---

## 7. 实施顺序（供 writing-plans 参考）

1. 删除 `messages/`；改 `api/errors.ts`；更新架构文档硬约束。
2. App 壳层：侧边栏（尝试 `shadcn add sidebar`，兜底手写）+ 导航栏 + 路由 + 欢迎页 + 折叠 store。
3. `features/blob`：api + queries（`useUploadBlob`）。
4. `features/moment`：api → queries → components → pages → 路由注册。
5. `components/common/media-preview-dialog`。
6. 测试补齐；`bun run typecheck` / `bun test` / `build` / `lint` 全绿。

## 8. 待确认 / 已延期（明确不做，防止回潮）

- Moment 评论 / 标签 UI：等后端 API 落地后再接。
- 主题切换按钮、用户区（侧边栏底部）：后续按需。
- 移动端抽屉式侧边栏的精细化：本次仅保证折叠可用。
- i18n：本次明确不引入。
