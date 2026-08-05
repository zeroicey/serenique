# Web 前端架构（Web Frontend Architecture）

日期: 2026-08-05

适用范围: `apps/web`（Serenique 浏览器端前端）

前置: 技术栈见 [[2026-08-05-web-frontend-tech-stack]]（`.ai/decisions/`）。本文定目录结构、feature 骨架与硬约束。

## 设计目标

- **通用结构**：不绑定某个产品/个人偏好，适配中型单页应用；feature 边界清晰，可增删模块不改全局。
- **分层依赖单向**：业务 → feature 内部；通用件不依赖业务；跨 feature 复用件提升到共享层。

## 目录结构

```
apps/web/src/
├── main.tsx               # 入口：挂载 App
├── App.tsx                # <Providers><AppRouter/></Providers>
├── app/                   # 应用外壳（跨 feature 的组装层）
│   ├── providers.tsx      # QueryClientProvider + ThemeProvider + Toaster
│   ├── router.tsx         # createBrowserRouter + 路由表 + lazy()
│   └── layout/            # 全局布局：侧边栏、顶栏、<Outlet/>
├── features/              # 业务功能模块（核心）
│   ├── <feature>/
│   │   ├── api.ts         # 本 feature 的 Ky 请求 + 请求/响应类型
│   │   ├── queries.ts     # TanStack Query hooks
│   │   ├── schemas.ts     # RHF + zod 表单 schema
│   │   ├── components/    # 本 feature 专属 UI
│   │   ├── pages/         # 路由页组件（懒加载入口）
│   │   └── index.ts       # barrel（对外只暴露 pages + 必要 hooks）
│   └── ...                # diary / moment / blob / task / event …
├── components/            # 全站通用组件
│   ├── ui/                # shadcn/ui 原语（button, dialog, form…）
│   └── common/            # 业务无关复用件（empty-state, confirm-dialog…）
├── api/                   # Ky 基础设施（非业务端点）
│   ├── client.ts          # Ky 实例、base URL、token 注入位点
│   ├── unwrap.ts          # 解包 { success, message, data } → data
│   └── errors.ts          # 错误映射 → 可展示错误
├── hooks/                 # 通用 hooks（use-debounce, use-media-query…）
├── lib/                   # 纯工具（cn(), format-date, format-size…）
├── stores/                # zustand：仅 UI/会话状态（theme, 侧栏, session）
├── config/                # env.ts：读取 VITE_API_BASE_URL 等
├── messages/              # 集中中文文案（index.ts 导出常量）
├── types/                 # 跨 feature 共享类型（分页、附件引用…）
├── styles/globals.css     # tailwind v4 入口
└── test/                  # vitest setup + helpers
```

## 划分原则

| 层 | 放什么 | 不许放 |
|---|---|---|
| `features/*` | 业务：API 调用 + Query hooks + 页面 + 专属组件 | 跨 feature 复用件（提升到 `components/common`） |
| `app/` | 组合与生命周期：providers、router、布局 | 任何业务逻辑 |
| `components/` + `lib/` + `hooks/` | 无业务语义的通用件 | 依赖 `features/*` |
| `api/` | Ky 基础设施 | 具体端点（放各 feature 的 `api.ts`） |
| `stores/` | 跨页面 UI/会话状态 | 服务端数据（一律走 TanStack Query） |
| `messages/` | 全部用户可见中文文案 | 散落的字符串字面量 |

## Feature 骨架

每个 feature 固定 6 个文件/目录，职责单一：

| 文件 | 职责 | 依赖 |
|---|---|---|
| `api.ts` | 端点请求（Ky）+ 请求/响应类型，定义本 feature 的 API 契约 | `api/client`、`api/unwrap` |
| `queries.ts` | Query hooks：读取用 `useQuery`，写操作用 `useMutation` + 成功 invalidate 本 feature key | 本 feature `api` |
| `schemas.ts` | RHF + zod 表单 schema，与 API 字段契约同源命名 | zod |
| `components/` | 本 feature 专属 UI 组件 | 本 feature queries/schemas、`components/ui` |
| `pages/` | 路由页组件，最外层壳（懒加载入口） | 本 feature components/queries |
| `index.ts` | barrel：只暴露 pages 与必要 hooks | — |

**新增一个 feature**（如 drive）只需：建 `features/drive/` 骨架 → 在 `app/router.tsx` 注册懒加载路由 → 在侧边栏加导航项。无需改动其他全局层。

**跨 feature 复用**：`blob` 的 hooks（上传/附件）被 diary/moment 使用，从 `features/blob/` 直接 import 即可；若某组件被 3+ 个 feature 复用且无业务语义，提升到 `components/common/`。

## 硬约束

- 服务端数据只走 TanStack Query，不进 Zustand。
- 用户可见文案一律经 `messages/`，不散落字符串。
- API 调用统一走 `api/client.ts`（token 注入位点在此，当前为空——API 暂无鉴权）。
- 所有 feature 页面懒加载（`React.lazy` + `Suspense`）。
- 错误处理：mutation 失败统一 Toast（sonner）；Query 错误在页面层兜底展示。
- 请求/响应类型手动定义，不 import `@serenique/api`。
