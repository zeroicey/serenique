# App 壳层 + Moment 模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `serenique/apps/web` 搭建 App 壳层（侧边栏 + 顶栏 + 动态导航 + 欢迎页），并实现 Moment 模块（列表/新建/删除 + blob 附件上传预览），UI 观感对齐旧项目 `serenique-test/apps/web`。

**Architecture:** 按 `.ai/architecture/2026-08-05-web-frontend-architecture.md` 的 feature 模块化骨架；动态导航用路由 `handle.nav` + `useMatches()` 解析；Moment 附件走后端 blob 模块（上传→blobId→内联 attachments，文件直读 `fileUrl`）。

**Tech Stack:** Bun / Vite / React 19 / TypeScript strict / Tailwind v4 + shadcn(Base UI) / React Router 8 / Ky / TanStack Query v5 / Zustand v5 / react-hook-form + zod / sonner / Vitest + RTL。

## Global Constraints

- 工作目录：`apps/web/`（当前仓库 `serenique`）；不要 import `@serenique/api`（web 端类型手动定义）。
- 路径别名 `@/*` → `src/*`；统一响应解包走 `@/api/unwrap` 的 `unwrap`；请求路径经 `@/api/client` 的 `apiUrl()`。
- 服务端数据只走 TanStack Query；Zustand 只放 UI/会话状态。
- 所有页面 `React.lazy` + `<Suspense>` 懒加载。
- 错误处理：mutation 失败统一 sonner Toast；query 错误在页面层兜底。
- 中文文案**直接内联**在页面/组件（不 import messages，`messages/` 目录已删除）。
- shadcn sidebar 已确认可用：`bunx shadcn add sidebar --yes --overwrite`（会新增 `src/components/ui/sidebar.tsx`、`src/hooks/use-mobile.ts`，更新 `separator.tsx`/`tooltip.tsx`）。
- 测试：Vitest + RTL；组件/页面渲染用 `@/test/helpers` 的 `renderWithProviders`；jsdom 需在 `test/setup.ts` 补 `IntersectionObserver` mock。
- 验证命令：`cd apps/web && bun run typecheck && bun run test && bun run lint && bun run build`；根 `bun run typecheck && bun run test`。
- **坑点（2026-08-05 实测）**：web 包内不要用 `bun test` —— 那会跑 Bun 原生测试器（无 jsdom，`document` 未定义，react-router 报错）。web 的测试命令是 `bun run test`（= `vitest run`，读取 vite.config.ts 的 `test.environment: jsdom`）。根 `bun test` 只覆盖 MCP（bun:test），web 走根 `test` 脚本。

---

### Task 1: 移除 `messages/`，文案内联，同步架构文档

**Files:**
- Delete: `apps/web/src/messages/index.ts`
- Modify: `apps/web/src/api/errors.ts:19`
- Modify: `.ai/architecture/2026-08-05-web-frontend-architecture.md`（目录树 messages 行、划分原则表 messages 行、硬约束条）
- Modify: `.ai/decisions/2026-08-05-web-frontend-tech-stack.md`（决策点 2 界面语言描述）

**Interfaces:**
- Produces: `toDisplayError(error: unknown): Error` 不再依赖 messages，文案内联为 `'发生未知错误'`。

- [ ] **Step 1: 删除 messages 目录**

```bash
git rm -r apps/web/src/messages
```

- [ ] **Step 2: 内联 errors.ts 文案**

`apps/web/src/api/errors.ts` 中删除 `import { messages } from '@/messages'`，并把：

```ts
export function toDisplayError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(messages.error.unknown)
}
```

改为：

```ts
export function toDisplayError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error('发生未知错误')
}
```

同一步内处理 `app/layout/app-layout.tsx`（删除 messages 引用，内联品牌名；Task 2 会整体重写该文件）：

`apps/web/src/app/layout/app-layout.tsx` 删除 `import { messages } from '@/messages'`，并把：

```tsx
<div className="mx-auto max-w-5xl px-4 py-3 font-medium">{messages.app.name}</div>
```

改为：

```tsx
<div className="mx-auto max-w-5xl px-4 py-3 font-medium">Serenique</div>
```

- [ ] **Step 3: 更新架构文档**

`.ai/architecture/2026-08-05-web-frontend-architecture.md` 三处修改：
1. 删除目录树第 45 行 `├── messages/              # 集中中文文案（index.ts 导出常量）`。
2. 删除「划分原则」表中 `| messages/ | 全部用户可见中文文案 | 散落的字符串字面量 |` 一行。
3. 「硬约束」中把 `- 用户可见文案一律经 \`messages/\`，不散落字符串。` 替换为：

```md
- 用户可见文案为中文，**直接内联**在对应页面/组件中（2026-08-05 决策：删除 messages/，个人应用文案随组件走；后续如需 i18n 再抽层）。见 [[2026-08-05-web-moment-feature-design]] 决策⑧。
```

- [ ] **Step 4: 更新技术栈决策文档**

`.ai/decisions/2026-08-05-web-frontend-tech-stack.md` 决策点 2「界面语言」中，把 **How to apply** 一行替换为：

```md
  **How to apply**：用户可见文案中文直接写在组件内，不集中管理（2026-08-05 用户决策：删除 `src/messages/`）。
```

- [ ] **Step 5: 验证并提交**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run typecheck && bun run test
cd /Users/zeroicey/workspace/projects/serenique && git add -A apps/web/src .ai
git commit -m "refactor(web): remove messages module, inline Chinese copy"
```

Expected: typecheck 通过；`App.test.tsx` 仍渲染 "Serenique"（App 内不再引用 messages，其文案来自后续壳层，Task 2 保证）。

---

### Task 2: App 壳层 — 侧边栏、导航栏、动态导航槽、路由、欢迎页

**Files:**
- Create: `apps/web/src/components/common/app-sidebar.tsx`
- Create: `apps/web/src/app/layout/app-navbar.tsx`
- Modify: `apps/web/src/app/layout/app-layout.tsx`（整体重写）
- Modify: `apps/web/src/app/router.tsx`（整体重写）
- Modify: `apps/web/src/app/providers.tsx`（包 `TooltipProvider`）
- Create: `apps/web/src/app/pages/welcome-page.tsx`
- Create: `apps/web/src/app/pages/not-found-page.tsx`
- Create: `apps/web/src/app/layout/page-loading.tsx`
- Test: `apps/web/src/app/layout/app-navbar.test.tsx`
- Test: `apps/web/src/components/common/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: shadcn `sidebar.tsx`（Task 2 Step 1 生成，导出 `SidebarProvider/Sidebar/SidebarHeader/SidebarContent/SidebarMenu/SidebarMenuItem/SidebarMenuButton/SidebarRail/SidebarTrigger`）。
- Produces: `AppSidebar()`、`AppNavbar()`（读 `useMatches()` 的 `handle.nav`）、`PageLoading()`、`WelcomePage()`、`NotFoundPage()`；`app/router.tsx` 注册 `/`、`/moment`、`/moment/create`、`*`。

- [ ] **Step 1: 添加 shadcn sidebar**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bunx shadcn add sidebar --yes --overwrite
```

Expected: 创建 `src/components/ui/sidebar.tsx`、`src/hooks/use-mobile.ts`；更新 `separator.tsx`、`tooltip.tsx`。

- [ ] **Step 2: providers 包 TooltipProvider**

`apps/web/src/app/providers.tsx` 改为：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'

// 应用级 Provider 组装：TanStack Query + 主题 + Tooltip + Toast。
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3: 创建 AppSidebar**

`apps/web/src/components/common/app-sidebar.tsx`：

```tsx
import { FileText } from 'lucide-react'
import { NavLink } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

// 全局侧边栏：品牌区 + 模块导航。当前仅 Moment 一个模块，后续新增模块在此追加导航项。
export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="flex flex-col items-center gap-3 py-4">
        <span className="text-xl font-semibold">Serenique</span>
        <Separator className="w-full" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="space-y-1 px-2">
          <SidebarMenuItem>
            <NavLink to="/moment" className="flex items-center gap-2">
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive}>
                  <FileText />
                  <span className="text-lg">闪念</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
```

- [ ] **Step 4: 创建 AppNavbar（动态导航槽）**

`apps/web/src/app/layout/app-navbar.tsx`：

```tsx
import { type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useMatches } from 'react-router'

// 顶栏：折叠按钮 + 动态导航槽。动态导航内容由路由 handle.nav 提供（feature 自行注册）。
export function AppNavbar() {
  const matches = useMatches()
  const nav = [...matches]
    .reverse()
    .map((m) => (m.handle as { nav?: ReactNode } | undefined)?.nav)
    .find(Boolean)

  return (
    <header className="flex h-16 items-center gap-2 border-b px-4 py-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2" />
      <div className="flex-1">{nav}</div>
    </header>
  )
}
```

- [ ] **Step 5: 创建 PageLoading**

`apps/web/src/app/layout/page-loading.tsx`：

```tsx
import { Loader2 } from 'lucide-react'

export function PageLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
```

- [ ] **Step 6: 重写 AppLayout**

`apps/web/src/app/layout/app-layout.tsx`：

```tsx
import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/common/app-sidebar'
import { AppNavbar } from './app-navbar'
import { PageLoading } from './page-loading'

// 全局布局：侧边栏 +（顶栏 + 内容区）。路由页面在此经 Suspense 懒加载。
export default function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppNavbar />
          <main className="flex-1 overflow-auto px-1 py-4">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
```

- [ ] **Step 7: 创建欢迎页与 404**

`apps/web/src/app/pages/welcome-page.tsx`：

```tsx
import { ChevronRight, FileText } from 'lucide-react'
import { Link } from 'react-router'

// 首页：极简品牌 + 模块入口卡片，占位后续丰富。
export default function WelcomePage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-4">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">Serenique</h1>
        <p className="text-muted-foreground">个人闪念与笔记</p>
      </div>
      <nav className="w-full max-w-sm">
        <Link
          to="/moment"
          className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
        >
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-lg">闪念</span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      </nav>
    </div>
  )
}
```

`apps/web/src/app/pages/not-found-page.tsx`：

```tsx
import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <p className="text-2xl font-semibold">页面不存在</p>
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        返回首页
      </Link>
    </div>
  )
}
```

- [ ] **Step 8: 重写 router**

`apps/web/src/app/router.tsx`：

```tsx
import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppLayout from '@/app/layout/app-layout'
import { PageLoading } from '@/app/layout/page-loading'

// 懒加载 + Suspense 包装；handle.nav 注册该路由的动态导航内容。
function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(loader)
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  )
}

// 欢迎页 / 404 属于壳层；Moment 路由在 Task 6 接线（见 Task 6 Step 5）。
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: lazyPage(() => import('@/app/pages/welcome-page')) },
      { path: '*', element: lazyPage(() => import('@/app/pages/not-found-page')) },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 9: 测试**

`apps/web/src/app/layout/app-navbar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppNavbar } from './app-navbar'

describe('AppNavbar', () => {
  it('渲染路由 handle.nav 的动态导航内容', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <SidebarProvider>
            <AppNavbar />
          </SidebarProvider>
        ),
        handle: { nav: <div>测试导航</div> },
      },
    ])
    render(<RouterProvider router={router} />)
    expect(screen.getByText('测试导航')).toBeInTheDocument()
  })
})
```

`apps/web/src/components/common/app-sidebar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'

describe('AppSidebar', () => {
  it('渲染品牌与 Moment 导航项', () => {
    const router = createMemoryRouter([
      { path: '/', element: <SidebarProvider><AppSidebar /></SidebarProvider> },
    ])
    render(<RouterProvider router={router} />)
    expect(screen.getByText('Serenique')).toBeInTheDocument()
    expect(screen.getByText('闪念')).toBeInTheDocument()
  })
})
```

- [ ] **Step 10: 验证并提交**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run typecheck && bun run test
cd /Users/zeroicey/workspace/projects/serenique && git add -A apps/web/src
git commit -m "feat(web): app shell with sidebar, dynamic navbar, welcome page"
```

Expected: typecheck 通过；App.test / AppNavbar.test / AppSidebar.test 全过。侧边栏「闪念」此时指向 `/moment`（路由在 Task 6 接线，点击暂显 404，属预期）。

---

### Task 3: `features/blob` — 上传 api + hooks

**Files:**
- Create: `apps/web/src/features/blob/api.ts`
- Create: `apps/web/src/features/blob/queries.ts`
- Modify: `apps/web/src/features/blob/index.ts`（barrel 导出）
- Test: `apps/web/src/features/blob/api.test.ts`

**Interfaces:**
- Consumes: `api` / `apiUrl` from `@/api/client`；`unwrap` from `@/api/unwrap`。
- Produces:
  - `interface BlobEntry { id: string; originalName: string; mimeType: string; size: number; checksum: string; metadata: Record<string, unknown>; width: number | null; height: number | null; duration: number | null; createdAt: string }`
  - `async function uploadBlob(file: File): Promise<BlobEntry>`
  - `function useUploadBlob(): UseMutationResult<BlobEntry, Error, File>`

- [ ] **Step 1: 写失败测试**

`apps/web/src/features/blob/api.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadBlob } from './api'

// 直接断言请求形状：FormData 携带 file、走 /api/blobs/upload、解包响应。
describe('uploadBlob', () => {
  afterEach(() => vi.restoreAllMocks())

  it('以 multipart 上传文件并解包 BlobEntry', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    const envelope = {
      success: true,
      message: '上传成功',
      data: { id: 'b1', originalName: 'a.png', mimeType: 'image/png', size: 3, checksum: 'x', metadata: {}, width: null, height: null, duration: null, createdAt: '2026-08-05T00:00:00.000Z' },
    }
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const result = await uploadBlob(file)

    expect(result.id).toBe('b1')
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/blobs/upload')
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    expect((form.get('file') as File).name).toBe('a.png')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run test src/features/blob/api.test.ts
```

Expected: FAIL（找不到 `uploadBlob` / `./api`）。

- [ ] **Step 3: 实现 api.ts**

`apps/web/src/features/blob/api.ts`：

```ts
import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

// Blob 上传域。Moment 等业务模块通过这里上传二进制文件（跨 feature 复用点）。

export interface BlobEntry {
  id: string
  originalName: string
  mimeType: string
  size: number
  checksum: string
  metadata: Record<string, unknown>
  width: number | null
  height: number | null
  duration: number | null
  createdAt: string
}

export async function uploadBlob(file: File): Promise<BlobEntry> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(apiUrl('blobs/upload'), { body: form, timeout: 60_000 })
  return unwrap<BlobEntry>(res)
}
```

- [ ] **Step 4: 实现 queries.ts + barrel**

`apps/web/src/features/blob/queries.ts`：

```ts
import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { uploadBlob, type BlobEntry } from './api'

// 上传 blob mutation。成功不 invalidate（blob 无列表依赖）。
export function useUploadBlob(): UseMutationResult<BlobEntry, Error, File> {
  return useMutation({ mutationFn: uploadBlob })
}
```

`apps/web/src/features/blob/index.ts`：

```ts
export { uploadBlob } from './api'
export type { BlobEntry } from './api'
export { useUploadBlob } from './queries'
```

- [ ] **Step 5: 验证并提交**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run test src/features/blob/api.test.ts && bun run typecheck
cd /Users/zeroicey/workspace/projects/serenique && git add -A apps/web/src/features/blob
git commit -m "feat(web): blob feature upload api and hook"
```

Expected: 测试 PASS；typecheck 通过。

---

### Task 4: `features/moment` — api + queries + schemas

**Files:**
- Create: `apps/web/src/features/moment/api.ts`
- Create: `apps/web/src/features/moment/queries.ts`
- Create: `apps/web/src/features/moment/schemas.ts`
- Modify: `apps/web/src/features/moment/index.ts`（barrel）
- Test: `apps/web/src/features/moment/queries.test.ts`
- Test: `apps/web/src/features/moment/schemas.test.ts`

**Interfaces:**
- Consumes: `Paged<T>` from `@/types/api`；`BlobEntry` from `@/features/blob/api`（Task 3）；`uploadBlob` from `@/features/blob/api`；`MediaFile` from `@/types/media`（Task 4 Step 6 创建）。
- Produces:
  - 类型：`MomentBlobEntry`、`MomentAttachmentEntry`、`MomentEntry`、`CreateMomentInput`、`ListMomentsParams`。
  - 函数：`listMoments(params?): Promise<Paged<MomentEntry>>`、`createMoment(input): Promise<MomentEntry>`、`deleteMoment(id): Promise<void>`、`removeMomentAttachment(momentId, attachmentId): Promise<void>`。
  - hooks：`useMoments(pageSize=10)`（`useInfiniteQuery`，pageParam 从 1 起）、`useCreateMoment()`、`useDeleteMoment()`、`useRemoveMomentAttachment()`、`useCreateMomentWithMedia()`。
  - `momentCreateSchema` / `MomentCreateFormValues`。

- [ ] **Step 1: 创建共享类型 media.ts**

`apps/web/src/types/media.ts`：

```ts
// 媒体文件：新建时为本地文件（带 file），展示时为已上传项（url 为 fileUrl）。
export interface MediaFile {
  id: string
  name: string
  type: string
  url: string
  file?: File
}
```

- [ ] **Step 2: 写失败测试（schemas）**

`apps/web/src/features/moment/schemas.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { momentCreateSchema } from './schemas'

describe('momentCreateSchema', () => {
  it('空文本校验失败', () => {
    const r = momentCreateSchema.safeParse({ text: '   ' })
    expect(r.success).toBe(false)
  })

  it('超过 500 字校验失败', () => {
    const r = momentCreateSchema.safeParse({ text: 'a'.repeat(501) })
    expect(r.success).toBe(false)
  })

  it('合法文本通过', () => {
    const r = momentCreateSchema.safeParse({ text: '今天很开心' })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 3: 写失败测试（queries 分页逻辑）**

`apps/web/src/features/moment/queries.test.ts`：

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { listMoments } from './api'
import { useMoments } from './queries'

vi.mock('./api', () => ({
  listMoments: vi.fn(),
  createMoment: vi.fn(),
  deleteMoment: vi.fn(),
  removeMomentAttachment: vi.fn(),
}))

const mockedList = vi.mocked(listMoments)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useMoments', () => {
  it('满页时推进页码，不足满页时停止', async () => {
    mockedList
      .mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, i) => makeMoment(i)), total: 25 })
      .mockResolvedValueOnce({ items: Array.from({ length: 10 }, (_, i) => makeMoment(10 + i)), total: 25 })
      .mockResolvedValueOnce({ items: Array.from({ length: 5 }, (_, i) => makeMoment(20 + i)), total: 25 })

    const { result } = renderHook(() => useMoments(10), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => { await result.current.fetchNextPage() })
    expect(result.current.data?.pages).toHaveLength(2)
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => { await result.current.fetchNextPage() })
    expect(result.current.data?.pages).toHaveLength(3)
    expect(result.current.hasNextPage).toBe(false)
  })
})

function makeMoment(i: number) {
  return { id: `m${i}`, text: `t${i}`, attachments: [], createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z' }
}
```

- [ ] **Step 4: 运行确认失败**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run test src/features/moment/schemas.test.ts src/features/moment/queries.test.ts
```

Expected: FAIL（`./schemas` / `./api` / `./queries` 不存在或未导出）。

- [ ] **Step 5: 实现 api.ts**

`apps/web/src/features/moment/api.ts`：

```ts
import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'
import type { Paged } from '@/types/api'

// Moment 模块 API 契约（手动定义，对齐 services/api 现状）。
// 附件走 blob 模块：先上传得 blobId，再以内联 attachments 建 Moment；文件直读 blob.fileUrl。

export interface MomentBlobEntry {
  id: string
  originalName: string
  mimeType: string
  size: number
  metadata: Record<string, unknown>
  width: number | null
  height: number | null
  duration: number | null
  createdAt: string
  fileUrl: string
}

export interface MomentAttachmentEntry {
  id: string
  blobId: string
  role: string
  displayName: string | null
  sortOrder: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  blob: MomentBlobEntry
}

export interface MomentEntry {
  id: string
  text: string
  attachments: MomentAttachmentEntry[]
  createdAt: string
  updatedAt: string
}

export interface MomentAttachmentInput {
  blobId: string
  displayName?: string
  sortOrder?: number
}

export interface CreateMomentInput {
  text: string
  attachments?: MomentAttachmentInput[]
}

export interface ListMomentsParams {
  page?: number
  pageSize?: number
}

export async function listMoments(params?: ListMomentsParams): Promise<Paged<MomentEntry>> {
  const res = await api.get(apiUrl('moments'), {
    searchParams: { page: String(params?.page ?? 1), pageSize: String(params?.pageSize ?? 10) },
  })
  return unwrap<Paged<MomentEntry>>(res)
}

export async function createMoment(input: CreateMomentInput): Promise<MomentEntry> {
  const res = await api.post(apiUrl('moments'), { json: input })
  return unwrap<MomentEntry>(res)
}

export async function deleteMoment(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`moments/${id}`))
  if (res.status === 204) return
  await unwrap(res)
}

export async function removeMomentAttachment(momentId: string, attachmentId: string): Promise<void> {
  const res = await api.delete(apiUrl(`moments/${momentId}/attachments/${attachmentId}`))
  if (res.status === 204) return
  await unwrap(res)
}
```

- [ ] **Step 6: 实现 schemas.ts**

`apps/web/src/features/moment/schemas.ts`：

```ts
import { z } from 'zod'

export const momentCreateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, '闪念内容不能为空')
    .max(500, '闪念最多 500 字'),
})

export type MomentCreateFormValues = z.infer<typeof momentCreateSchema>
```

- [ ] **Step 7: 实现 queries.ts**

`apps/web/src/features/moment/queries.ts`：

```ts
import { useMutation, useQueryClient, useInfiniteQuery, type UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { uploadBlob } from '@/features/blob/api'
import type { MediaFile } from '@/types/media'
import { createMoment, deleteMoment, listMoments, removeMomentAttachment, type CreateMomentInput, type MomentEntry } from './api'

// Moment 数据 hooks。读取走 useInfiniteQuery（滚动分页），写入走 useMutation + invalidate。

export function useMoments(pageSize = 10) {
  return useInfiniteQuery({
    queryKey: ['moments', pageSize],
    queryFn: ({ pageParam }) => listMoments({ page: pageParam, pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length === 0) return undefined
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })
}

export function useCreateMoment(): UseMutationResult<MomentEntry, Error, CreateMomentInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMoment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

export function useDeleteMoment(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMoment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

export function useRemoveMomentAttachment(): UseMutationResult<
  void,
  Error,
  { momentId: string; attachmentId: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ momentId, attachmentId }) => removeMomentAttachment(momentId, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['moments'] }),
  })
}

// 新建编排：逐个上传文件 → 以内联 attachments 创建 Moment。
export function useCreateMomentWithMedia(): UseMutationResult<
  MomentEntry,
  Error,
  { text: string; files: MediaFile[] }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ text, files }) => {
      const blobs: string[] = []
      for (const file of files) {
        if (!file.file) throw new Error('文件数据缺失')
        const blob = await uploadBlob(file.file)
        blobs.push(blob.id)
      }
      return createMoment({
        text,
        attachments: blobs.map((blobId, i) => ({ blobId, displayName: files[i]?.name, sortOrder: i })),
      })
    },
    onSuccess: () => {
      toast.success('闪念发布成功')
      queryClient.invalidateQueries({ queryKey: ['moments'] })
    },
    onError: (error) => {
      toast.error(error.message || '闪念发布失败')
    },
  })
}
```

- [ ] **Step 8: barrel**

`apps/web/src/features/moment/index.ts`：

```ts
export {
  listMoments,
  createMoment,
  deleteMoment,
  removeMomentAttachment,
} from './api'
export type {
  MomentEntry,
  MomentAttachmentEntry,
  MomentBlobEntry,
  CreateMomentInput,
} from './api'
export {
  useMoments,
  useCreateMoment,
  useDeleteMoment,
  useRemoveMomentAttachment,
  useCreateMomentWithMedia,
} from './queries'
export { momentCreateSchema } from './schemas'
export type { MomentCreateFormValues } from './schemas'
```

- [ ] **Step 9: 验证并提交**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run test src/features/moment/schemas.test.ts src/features/moment/queries.test.ts && bun run typecheck
cd /Users/zeroicey/workspace/projects/serenique && git add -A apps/web/src/types/media.ts apps/web/src/features/moment
git commit -m "feat(web): moment feature api, queries, schemas"
```

Expected: 测试 PASS；typecheck 通过。

---

### Task 5: 通用媒体预览 + moment 展示/新建组件

**Files:**
- Create: `apps/web/src/components/common/media-preview-dialog.tsx`
- Create: `apps/web/src/features/moment/components/moment-nav.tsx`
- Create: `apps/web/src/features/moment/components/moment-create-nav.tsx`
- Create: `apps/web/src/features/moment/components/moment-attachment-grid.tsx`
- Create: `apps/web/src/features/moment/components/moment-item.tsx`
- Create: `apps/web/src/features/moment/components/moment-list.tsx`
- Create: `apps/web/src/features/moment/components/moment-create-attachment-grid.tsx`
- Modify: `apps/web/src/test/setup.ts`（补 `IntersectionObserver` mock）
- Test: `apps/web/src/features/moment/components/moment-item.test.tsx`
- Test: `apps/web/src/features/moment/components/moment-create-attachment-grid.test.tsx`
- Test: `apps/web/src/components/common/media-preview-dialog.test.tsx`

**Interfaces:**
- Consumes: `MomentEntry`/`MomentAttachmentEntry` from `@/features/moment/api`；`useMoments`/`useDeleteMoment` from `@/features/moment/queries`；`MediaFile` from `@/types/media`；shadcn `dialog/button/dropdown-menu/separator/skeleton/textarea/input`。
- Produces:
  - `MediaPreviewDialog({ open, mediaFiles, currentIndex, onClose, onNavigate })` — 全屏媒体预览 + 前后切换。
  - `MomentNav()` — 顶栏动态导航（标题 + 新建按钮）。
  - `MomentCreateNav()` — 顶栏面包屑。
  - `MomentAttachmentGrid({ attachments })` — 3 列网格、>9 展开、点击预览。
  - `MomentItem({ moment })` — 文字截断 + 附件网格 + 时间/字数 + 删除。
  - `MomentList()` — 无限滚动列表（IntersectionObserver 自动加载）。
  - `MomentCreateAttachmentGrid({ mediaFiles, onChange })` — 选文件 + 预览 + 移除。

- [ ] **Step 1: setup 补 IntersectionObserver 与 URL 对象 mock**

`apps/web/src/test/setup.ts` 整体改为：

```ts
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom 未实现 matchMedia，next-themes 依赖它。
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom 未实现 IntersectionObserver，滚动加载组件依赖它。
class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

// jsdom 未实现 createObjectURL，新建页本地预览依赖它。
URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL
URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
```

- [ ] **Step 2: 创建 MediaPreviewDialog**

`apps/web/src/components/common/media-preview-dialog.tsx`：

```tsx
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { MediaFile } from '@/types/media'

interface MediaPreviewDialogProps {
  open: boolean
  mediaFiles: MediaFile[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

// 通用媒体全屏预览：图片/视频/音频/其他，支持前后切换。无业务逻辑，供各 feature 复用。
export function MediaPreviewDialog({ open, mediaFiles, currentIndex, onClose, onNavigate }: MediaPreviewDialogProps) {
  const file = mediaFiles[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < mediaFiles.length - 1

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl border-none bg-black/90">
        <div className="flex min-h-[50vh] w-full items-center justify-center">
          {file?.type.startsWith('image/') ? (
            <img src={file.url} alt={file.name} className="max-h-[70vh] max-w-full object-contain" />
          ) : file?.type.startsWith('video/') ? (
            <video src={file.url} controls autoPlay className="max-h-[70vh] max-w-full" />
          ) : file?.type.startsWith('audio/') ? (
            <audio src={file.url} controls autoPlay className="w-full max-w-md" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white">
              <FileText className="h-12 w-12" />
              <span className="text-sm">{file?.name ?? ''}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" aria-label="上一张" disabled={!hasPrev} onClick={() => onNavigate(currentIndex - 1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {mediaFiles.length > 0 ? `${currentIndex + 1} / ${mediaFiles.length}` : ''}
          </span>
          <Button variant="ghost" size="icon" aria-label="下一张" disabled={!hasNext} onClick={() => onNavigate(currentIndex + 1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 创建 MomentNav / MomentCreateNav**

`apps/web/src/features/moment/components/moment-nav.tsx`：

```tsx
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// 列表页动态导航：标题 + 新建按钮。
export function MomentNav() {
  const navigate = useNavigate()
  return (
    <div className="flex w-full items-center justify-between">
      <span className="text-xl">闪念</span>
      <Button onClick={() => navigate('/moment/create')}>
        <Plus />
        新建闪念
      </Button>
    </div>
  )
}
```

`apps/web/src/features/moment/components/moment-create-nav.tsx`：

```tsx
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'

// 新建页动态导航：面包屑（闪念 / 新建）。
export function MomentCreateNav() {
  const navigate = useNavigate()
  return (
    <div className="flex w-full items-center gap-2">
      <Button variant="ghost" className="text-xl" onClick={() => navigate('/moment')}>
        闪念
      </Button>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <span className="text-lg">新建</span>
    </div>
  )
}
```

- [ ] **Step 4: 创建 MomentAttachmentGrid**

`apps/web/src/features/moment/components/moment-attachment-grid.tsx`：

```tsx
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { MediaPreviewDialog } from '@/components/common/media-preview-dialog'
import type { MomentAttachmentEntry } from '@/features/moment/api'
import type { MediaFile } from '@/types/media'

interface MomentAttachmentGridProps {
  attachments: MomentAttachmentEntry[]
}

const PREVIEW_COUNT = 8

// 附件 3 列网格：>9 折叠显示前 8 张 + "更多" 瓦片；点击进入全屏预览。
export function MomentAttachmentGrid({ attachments }: MomentAttachmentGridProps) {
  const [expanded, setExpanded] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const sorted = [...attachments].sort((a, b) => a.sortOrder - b.sortOrder)
  const needsExpand = sorted.length > PREVIEW_COUNT + 1
  const display = needsExpand && !expanded ? sorted.slice(0, PREVIEW_COUNT) : sorted

  const mediaFiles: MediaFile[] = sorted.map((a) => ({
    id: a.id,
    name: a.displayName ?? a.blob.originalName,
    type: a.blob.mimeType,
    url: a.blob.fileUrl,
  }))

  if (sorted.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {display.map((a, i) => (
          <div key={a.id} className="aspect-square cursor-pointer overflow-hidden rounded-lg bg-muted" onClick={() => setPreviewIndex(i)}>
            <AttachmentTile attachment={a} />
          </div>
        ))}
        {needsExpand && !expanded && (
          <div
            className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg bg-muted hover:bg-accent"
            onClick={() => setExpanded(true)}
          >
            <MoreHorizontal className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">+{sorted.length - PREVIEW_COUNT} 更多</span>
          </div>
        )}
      </div>

      <MediaPreviewDialog
        open={previewIndex !== null}
        mediaFiles={mediaFiles}
        currentIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onNavigate={setPreviewIndex}
      />
    </>
  )
}

function AttachmentTile({ attachment }: { attachment: MomentAttachmentEntry }) {
  const { blob } = attachment
  const isVideo = blob.mimeType.startsWith('video/')
  if (blob.mimeType.startsWith('image/')) {
    return <img src={blob.fileUrl} alt={blob.originalName} loading="lazy" className="h-full w-full object-cover" />
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {isVideo ? '▶' : '📎'}
    </div>
  )
}
```

- [ ] **Step 5: 创建 MomentItem**

`apps/web/src/features/moment/components/moment-item.tsx`：

```tsx
import { Clock, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@/lib/format'
import { useDeleteMoment } from '@/features/moment/queries'
import type { MomentEntry } from '@/features/moment/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MomentAttachmentGrid } from './moment-attachment-grid'

interface MomentItemProps {
  moment: MomentEntry
}

const TEXT_TRUNCATE = 150

// 单条闪念卡片：文字（超长截断）+ 附件网格 + 时间/字数 + 删除。
export function MomentItem({ moment }: MomentItemProps) {
  const { mutate: deleteMoment } = useDeleteMoment()
  const [textExpanded, setTextExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const showToggle = moment.text.length > TEXT_TRUNCATE
  const text = showToggle && !textExpanded ? moment.text.slice(0, TEXT_TRUNCATE) + '…' : moment.text

  return (
    <div className="flex w-full max-w-[600px] flex-col gap-2">
      <div className="text-base">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {showToggle && (
          <button className="mt-1 text-sm text-blue-600 hover:underline" onClick={() => setTextExpanded((v) => !v)}>
            {textExpanded ? '收起' : '展开'}
          </button>
        )}
      </div>

      <MomentAttachmentGrid attachments={moment.attachments} />

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock size={14} strokeWidth={1.8} />
          <span>{formatDate(moment.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{moment.text.length} 字</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除闪念</DialogTitle>
            <DialogDescription>确定删除这条闪念吗？删除后不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMoment(moment.id)
                setDeleteOpen(false)
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 6: 创建 lib/format（含测试）**

`apps/web/src/lib/format.ts`：

```ts
// 时间格式：MM-DD HH:mm。
export function formatDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}
```

`apps/web/src/lib/format.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('格式化为 MM-DD HH:mm', () => {
    expect(formatDate('2026-08-05T09:07:00.000Z')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
```

- [ ] **Step 7: 创建 MomentList**

`apps/web/src/features/moment/components/moment-list.tsx`：

```tsx
import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useMoments } from '@/features/moment/queries'
import { Button } from '@/components/ui/button'
import { MomentItem } from './moment-item'

// 闪念列表：居中列、滚动自动加载、加载/空/错误态。
export function MomentList() {
  const { isPending, isError, refetch, data, hasNextPage, isFetchingNextPage, fetchNextPage } = useMoments()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">加载闪念失败</p>
        <Button variant="outline" onClick={() => refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const moments = data?.pages.flatMap((p) => p.items) ?? []
  const isEmpty = moments.length === 0

  if (isEmpty) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-4xl">🌱</p>
        <h3 className="text-lg font-medium">还没有闪念</h3>
        <p className="max-w-sm text-muted-foreground">点击右上角「新建闪念」，记录此刻的心情。</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center">
      {moments.map((moment) => (
        <div key={moment.id} className="flex w-full max-w-[600px] flex-col items-center">
          <MomentItem moment={moment} />
          <div className="my-3 w-full border-b" />
        </div>
      ))}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && <Loader2 className="my-4 h-6 w-6 animate-spin text-muted-foreground" />}
    </div>
  )
}
```

- [ ] **Step 8: 创建 MomentCreateAttachmentGrid**

`apps/web/src/features/moment/components/moment-create-attachment-grid.tsx`：

```tsx
import { Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { MediaPreviewDialog } from '@/components/common/media-preview-dialog'
import type { MediaFile } from '@/types/media'

interface MomentCreateAttachmentGridProps {
  mediaFiles: MediaFile[]
  onChange: (files: MediaFile[]) => void
}

const ACCEPT = 'image/*,video/*,audio/*'

// 新建页附件选择：多选 + 本地预览 + 移除 + 预览切换。
export function MomentCreateAttachmentGrid({ mediaFiles, onChange }: MomentCreateAttachmentGridProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const next = [...mediaFiles]
    Array.from(files).forEach((file) => {
      next.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        file,
      })
    })
    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleRemove = (index: number) => {
    URL.revokeObjectURL(mediaFiles[index].url)
    onChange(mediaFiles.filter((_, i) => i !== index))
  }

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={(e) => handleFiles(e.target.files)} className="hidden" />
      <div className="grid grid-cols-3 gap-1">
        {mediaFiles.map((file, i) => (
          <div key={file.id} className="group relative aspect-square cursor-pointer overflow-hidden border" onClick={() => setPreviewIndex(i)}>
            <Thumb file={file} />
            <div
              className="absolute right-1 top-1 rounded-full bg-red-500 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(i)
              }}
            >
              <X className="h-3 w-3 text-white" />
            </div>
          </div>
        ))}
        <div
          className="flex aspect-square cursor-pointer flex-col items-center justify-center border-2 border-dashed text-muted-foreground hover:border-gray-400"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mb-1 h-6 w-6" />
          <span className="text-xs">添加媒体</span>
        </div>
      </div>

      <MediaPreviewDialog
        open={previewIndex !== null}
        mediaFiles={mediaFiles}
        currentIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onNavigate={setPreviewIndex}
      />
    </div>
  )
}

function Thumb({ file }: { file: MediaFile }) {
  if (file.type.startsWith('image/')) {
    return <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
  }
  if (file.type.startsWith('video/')) {
    return <video src={file.url} className="h-full w-full object-cover" muted />
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-muted p-2 text-muted-foreground">
      <span className="text-2xl">🎵</span>
      <span className="w-full truncate text-xs">{file.name}</span>
    </div>
  )
}
```

- [ ] **Step 9: 写组件测试**

`apps/web/src/features/moment/components/moment-item.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MomentEntry } from '@/features/moment/api'
import { MomentItem } from './moment-item'

vi.mock('@/features/moment/queries', () => ({
  useDeleteMoment: () => ({ mutate: vi.fn() }),
}))

const longText = '长'.repeat(200)

function makeMoment(text: string): MomentEntry {
  return { id: 'm1', text, attachments: [], createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z' }
}

describe('MomentItem', () => {
  it('超长文本默认截断，可展开/收起', async () => {
    const user = userEvent.setup()
    render(<MomentItem moment={makeMoment(longText)} />)
    expect(screen.getByText('展开')).toBeInTheDocument()
    await user.click(screen.getByText('展开'))
    expect(screen.getByText('收起')).toBeInTheDocument()
  })

  it('短文本不显示展开按钮', () => {
    render(<MomentItem moment={makeMoment('短文本')} />)
    expect(screen.queryByText('展开')).not.toBeInTheDocument()
  })

  it('渲染字数', () => {
    render(<MomentItem moment={makeMoment('今天很开心')} />)
    expect(screen.getByText('5 字')).toBeInTheDocument()
  })
})
```

`apps/web/src/features/moment/components/moment-create-attachment-grid.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MomentCreateAttachmentGrid } from './moment-create-attachment-grid'

describe('MomentCreateAttachmentGrid', () => {
  it('选择文件后加入列表并可移除', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<MomentCreateAttachmentGrid mediaFiles={[]} onChange={onChange} />)

    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await user.upload(input, file)

    expect(onChange).toHaveBeenCalledTimes(1)
    const files = onChange.mock.calls[0][0] as { name: string; file?: File }[]
    expect(files[0].name).toBe('a.png')
    expect(files[0].file).toBeInstanceOf(File)
  })
})
```

`apps/web/src/components/common/media-preview-dialog.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MediaFile } from '@/types/media'
import { MediaPreviewDialog } from './media-preview-dialog'

const files: MediaFile[] = [
  { id: '1', name: 'a.png', type: 'image/png', url: '/file/a' },
  { id: '2', name: 'b.mp4', type: 'video/mp4', url: '/file/b' },
]

describe('MediaPreviewDialog', () => {
  it('显示当前索引与计数，下一张可导航', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<MediaPreviewDialog open mediaFiles={files} currentIndex={0} onClose={vi.fn()} onNavigate={onNavigate} />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一张' }))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })
})
```

- [ ] **Step 10: 验证并提交**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run test && bun run typecheck
cd /Users/zeroicey/workspace/projects/serenique && git add -A apps/web/src
git commit -m "feat(web): moment list/create components and media preview"
```

Expected: 全部测试 PASS；typecheck 通过。此提交同时满足 Task 2 对 `MomentNav`/`MomentCreateNav` 的依赖。

---

### Task 6: Moment 页面（列表/新建）+ 草稿 store + 路由注册验证

**Files:**
- Create: `apps/web/src/stores/moment-draft.ts`
- Create: `apps/web/src/features/moment/pages/moment-list-page.tsx`
- Create: `apps/web/src/features/moment/pages/moment-create-page.tsx`
- Test: `apps/web/src/features/moment/pages/moment-create-page.test.tsx`

**Interfaces:**
- Consumes: `useMoments`/`useCreateMomentWithMedia` from `@/features/moment/queries`；`momentCreateSchema` from `@/features/moment/schemas`；`MomentCreateAttachmentGrid`；`MomentList`；`useMomentDraftStore`（本 Task 创建）。
- Produces: `useMomentDraftStore()`、`MomentListPage()`、`MomentCreatePage()`；路由已由 Task 2 注册（Task 2 提交前需本 Task 页面存在）。

- [ ] **Step 1: 创建草稿 store**

`apps/web/src/stores/moment-draft.ts`：

```ts
import { create } from 'zustand'

interface MomentDraftState {
  draftText: string
  setDraftText: (text: string) => void
  clearDraft: () => void
}

// 新建页草稿（仅 UI 会话状态；服务端数据不走 zustand）。
export const useMomentDraftStore = create<MomentDraftState>((set) => ({
  draftText: '',
  setDraftText: (text) => set({ draftText: text }),
  clearDraft: () => set({ draftText: '' }),
}))
```

- [ ] **Step 2: 创建列表页**

`apps/web/src/features/moment/pages/moment-list-page.tsx`：

```tsx
import { MomentList } from '@/features/moment/components/moment-list'

export default function MomentListPage() {
  return (
    <div className="flex h-full w-full justify-center">
      <MomentList />
    </div>
  )
}
```

- [ ] **Step 3: 创建新建页**

`apps/web/src/features/moment/pages/moment-create-page.tsx`：

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useCreateMomentWithMedia } from '@/features/moment/queries'
import { momentCreateSchema, type MomentCreateFormValues } from '@/features/moment/schemas'
import { MomentCreateAttachmentGrid } from '@/features/moment/components/moment-create-attachment-grid'
import { useMomentDraftStore } from '@/stores/moment-draft'
import type { MediaFile } from '@/types/media'

// 新建闪念：textarea 自动增高 + 附件选择 + 草稿保存。
export default function MomentCreatePage() {
  const navigate = useNavigate()
  const { draftText, setDraftText, clearDraft } = useMomentDraftStore()
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { mutate: createMoment, isPending } = useCreateMomentWithMedia()

  const { register, handleSubmit, watch, setValue, reset } = useForm<MomentCreateFormValues>({
    resolver: zodResolver(momentCreateSchema),
    defaultValues: { text: draftText },
  })
  const textValue = watch('text')

  useEffect(() => {
    setDraftText(textValue)
  }, [textValue, setDraftText])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 150)}px`
  }, [textValue])

  const onSubmit = handleSubmit((values) => {
    createMoment(
      { text: values.text, files: mediaFiles },
      {
        onSuccess: () => {
          reset()
          setMediaFiles([])
          clearDraft()
          navigate('/moment')
        },
      },
    )
  })

  const handleCancel = () => {
    setMediaFiles([])
    clearDraft()
    navigate('/moment')
  }

  return (
    <div className="flex h-full w-full justify-center overflow-auto">
      <form className="flex h-full w-full max-w-[350px] flex-col" onSubmit={onSubmit}>
        <div className="flex-1 space-y-1 overflow-auto">
          <textarea
            {...register('text')}
            ref={(el) => {
              textareaRef.current = el
            }}
            value={textValue}
            onChange={(e) => setValue('text', e.target.value)}
            placeholder="此刻在想什么？"
            className="min-h-[150px] w-full resize-none p-2 focus:outline-none"
          />
          <MomentCreateAttachmentGrid mediaFiles={mediaFiles} onChange={setMediaFiles} />
        </div>
        <div className="flex w-full gap-5 border-t p-4">
          <Button type="submit" className="flex-1 cursor-pointer" disabled={isPending}>
            {isPending ? '发布中…' : '发布'}
          </Button>
          <Button type="button" variant="secondary" className="flex-1 cursor-pointer" disabled={isPending} onClick={handleCancel}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
```

> 注：RHF 受控 textarea 用 `value` + `setValue`（spread `register` 提供 name/校验钩子）。如需精确校验错误提示，后续可加 `errors.text.message` 展示。

- [ ] **Step 4: 写新建页测试**

`apps/web/src/features/moment/pages/moment-create-page.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/helpers'
import { useMomentDraftStore } from '@/stores/moment-draft'
import * as queries from '@/features/moment/queries'
import { MomentCreatePage } from './moment-create-page'

vi.mock('@/features/moment/queries', () => ({
  useCreateMomentWithMedia: vi.fn(),
}))

// mutate 为 spy（不触发 onSuccess，避免导航卸载）；isPending 固定 false。
let mutate: ReturnType<typeof vi.fn>
beforeEach(() => {
  useMomentDraftStore.getState().clearDraft()
  mutate = vi.fn()
  vi.mocked(queries.useCreateMomentWithMedia).mockReturnValue({
    mutate,
    isPending: false,
  } as never)
})

describe('MomentCreatePage', () => {
  it('空文本不触发发布', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '   ')
    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('输入文本后发布携带正确参数', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <MomentCreatePage />
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText('此刻在想什么？'), '今天很开心')
    await user.click(screen.getByRole('button', { name: '发布' }))
    expect(mutate).toHaveBeenCalledWith({ text: '今天很开心', files: [] }, expect.any(Object))
  })
})
```

> 注意：`MomentCreatePage` 用了 `useMomentDraftStore`（zustand）、RHF、路由 hooks，测试需包 `renderWithProviders` + `MemoryRouter`。用模块级 `vi.mock` + 捕获的 `mutate` spy 断言调用参数，避免 onSuccess 触发的导航卸载影响断言。

- [ ] **Step 5: 接线 moment 路由**

`apps/web/src/app/router.tsx` 顶部 import 区添加（在 `PageLoading` import 之后）：

```tsx
import { MomentNav } from '@/features/moment/components/moment-nav'
import { MomentCreateNav } from '@/features/moment/components/moment-create-nav'
```

并把 children 改为：

```tsx
children: [
  { index: true, element: lazyPage(() => import('@/app/pages/welcome-page')) },
  {
    path: 'moment',
    element: lazyPage(() => import('@/features/moment/pages/moment-list-page')),
    handle: { nav: <MomentNav /> },
  },
  {
    path: 'moment/create',
    element: lazyPage(() => import('@/features/moment/pages/moment-create-page')),
    handle: { nav: <MomentCreateNav /> },
  },
  { path: '*', element: lazyPage(() => import('@/app/pages/not-found-page')) },
],
```

- [ ] **Step 6: 验证并提交**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run typecheck && bun run test
cd /Users/zeroicey/workspace/projects/serenique && git add -A apps/web/src
git commit -m "feat(web): moment list and create pages, wire moment routes"
```

---

### Task 7: 全量验证与收尾

**Files:**
- None（验证 + 必要的小修）。

- [ ] **Step 1: 全量验证**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run typecheck && bun run test && bun run lint && bun run build
cd /Users/zeroicey/workspace/projects/serenique && bun run typecheck && bun run test
```

Expected: 全部通过。lint 若报未使用变量等，就地修复后重跑。

- [ ] **Step 2: 手动冒烟（可选）**

```bash
cd /Users/zeroicey/workspace/projects/serenique/apps/web && bun run dev
```

- 打开 `http://localhost:5173/`：见欢迎页；点「闪念」进列表（空态）；点「新建闪念」；输入文本 + 添加图片；点「发布」→ 跳回列表，出现新卡片；点卡片删除 → 确认 → 消失。
- 顶栏随路由切换「闪念 / 新建闪念」与「闪念 › 新建」。

- [ ] **Step 3: 写工作日志**

在 `.ai/worklog/2026-08-05-web-moment-feature-implementation.md` 记录：完成内容、验证结果、坑点（shadcn add 需 `--yes --overwrite`、jsdom 需补 IntersectionObserver、RHF 受控 textarea 写法、blob 先行导致的孤儿 blob），并提交。

```bash
cd /Users/zeroicey/workspace/projects/serenique && git add -A .ai/worklog
git commit -m "docs(ai): worklog for web app shell and moment module"
```

---

## 任务依赖关系

```
Task 1 (messages/ 移除)         — 独立
Task 2 (壳层：侧边栏/导航/欢迎页) — 独立（moment 路由在 Task 6 接线）
Task 3 (blob 上传)              — 独立
Task 4 (moment api/queries)     — 依赖 Task 3
Task 5 (moment 组件)            — 依赖 Task 4
Task 6 (moment 页面 + 路由接线)  — 依赖 Task 5
Task 7 (全量验证收尾)
```

> 每个 Task 结束时均需 `bun run typecheck && bun run test` 通过，各自可提交。推荐顺序：Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7（壳层先行、feature 随后，每步保持绿态）。
