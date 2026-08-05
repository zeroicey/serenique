# 2026-08-05 — Web 前端 App 壳层 + Moment 模块实现

按设计 `.ai/architecture/2026-08-05-web-moment-feature-design.md` 与计划 `.ai/architecture/2026-08-05-web-moment-feature-plan.md` 实施，全部任务完成并验证。

## 本次完成

**App 壳层**
- shadcn `sidebar`（base-nova 风格可用，`bunx shadcn add sidebar --yes --overwrite`）。
- `AppSidebar`（品牌区 + 单「闪念」导航项，可折叠）；`AppNavbar`（`SidebarTrigger` + 动态导航槽）。
- **动态导航**：路由 `handle.nav` + `useMatches()` 解析（方案 A，feature 自行注册导航组件）。
- `AppLayout`（SidebarProvider + flex + Suspense Outlet）；`WelcomePage` / `NotFoundPage`。
- `app/router.tsx` 懒加载路由 `/`、`/moment`、`/moment/create`、`*`。

**blob feature**（跨 feature 复用点）
- `features/blob/api.ts`（`uploadBlob` → `POST /api/blobs/upload`）+ `queries.ts`（`useUploadBlob`）。

**moment feature**
- `api.ts`（list/create/delete/removeAttachment，类型手动定义对齐后端）；`queries.ts`（`useMoments` 无限滚动、`useCreateMomentWithMedia` blob 先行编排）；`schemas.ts`（RHF+zod，text ≤500）。
- 组件：`moment-list`（IntersectionObserver 自动加载 + 空/错态）、`moment-item`（截断 150 + 附件网格 + 时间/字数 + 删除）、`moment-attachment-grid`（3 列、>9 展开）、`moment-create-attachment-grid`（选文件 + 预览 + 移除）、`moment-nav` / `moment-create-nav`。
- 通用 `components/common/media-preview-dialog`（图片/视频/音频全屏预览 + 前后切换）。
- 页面：`moment-list-page`、`moment-create-page`（自动增高 textarea + 草稿 zustand store）；路由接线。
- 删除 `messages/`（决策⑧），文案内联；同步更新架构/技术栈文档。

## 验证

- `apps/web`：`bun run typecheck` ✓、`bun run test`（vitest，19 用例）✓、`bun run lint`（0 error）✓、`bun run build` ✓（moment 页面已分包懒加载）。
- 根 `bun run typecheck` ✓、根 `bun run test`（MCP 6 + web 19）✓。
- 运行冒烟：dev server（端口 5174，5173 被占用）HTTP 200；`/api/moments` 经 Vite proxy 返回真实数据 ✓。

## 对下一次会话的提示（pitfalls）

1. **web 包测试命令是 `bun run test`，不是 `bun test`**。`bun test` 会跑 Bun 原生测试器（无 jsdom，`document` 未定义，react-router 直接报错）。`bun run test` = `vitest run`，读 vite.config.ts 的 `test.environment: jsdom`。根 `bun test` 只覆盖 MCP。
2. **`shadcn add` 在本仓库要带 `--yes --overwrite`**，否则覆盖确认交互会卡住；且 add 不写依赖到 package.json（需手动 `bun add`，本仓库已装 `@base-ui/react`）。
3. **jsdom 缺三样**：`matchMedia`（next-themes，setup 已 mock）、`IntersectionObserver`（滚动加载组件）、`URL.createObjectURL`（新建页预览）。已全部在 `test/setup.ts` mock。
4. **RTL 自动 cleanup 不会注册**（vitest 未开 `globals`）。必须显式 `afterEach(cleanup)`（已加进 setup.ts），否则同文件用例间 DOM 残留（多个 textarea/按钮）。
5. **`apiUrl()` 必须返回绝对 URL**。ky/undici 在测试环境不接受相对路径（`ERR_INVALID_URL`）；浏览器端等价。`apiBaseUrl` 为空时补 `window.location.origin`。
6. **base-nova（Base UI）组件的 `asChild` 不支持**。如 `DropdownMenuTrigger` 不再有 `asChild`，改为直接在 trigger 上传 `className` 或 `render` prop。
7. **shadcn 生成的 `use-mobile.ts` 有 lint 错误**（`react-hooks/set-state-in-effect`）。已修：初始值惰性计算进 `useState`，effect 内只订阅。
8. **RHF 受控 textarea 写法**：`{...register('text')}` + `value={watch('text')}` + `onChange={setValue}`；成功提交后 `reset()`。`watch` 会触发 `react-hooks/incompatible-library` 警告（React Compiler 提示，无碍，项目未启用 Compiler）。
9. **测试 ky 请求不要 mock 全局 fetch**——ky 会用单个 Request 调 fetch、且可能预读 body（Content-Length），断言不便。改为 `vi.mock('@/api/client')` 断言 `api.post(url, { body })`。
10. 端口 5173 被其他项目（wisestu）占用，本仓库 dev 会落到 5174。
