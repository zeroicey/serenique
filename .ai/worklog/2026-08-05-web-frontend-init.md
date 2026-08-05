# 2026-08-05 — Web 前端初始化（apps/web）

为 Serenique 初始化浏览器端前端。技术栈与架构已定稿并写入记忆：

- 决策：`.ai/decisions/2026-08-05-web-frontend-tech-stack.md`
- 架构：`.ai/architecture/2026-08-05-web-frontend-architecture.md`（feature 模块化目录 + 新增 feature 步骤）

## 本次完成

- **根 workspaces**：`["services/*"]` → `["services/*", "apps/web"]`；根 `typecheck`/`test` 脚本并入 web。
- **apps/web 脚手架**（全部最新稳定版，2026-08-05 调研）：
  - Vite **8.2.0** + `@vitejs/plugin-react@6`（plugin 6 要求 vite ^8）
  - React **19.2.8** / React DOM 19.2.8，TypeScript **~5.9.3**（见坑点 1）
  - Tailwind **4.3.3**（`@tailwindcss/vite` 插件，CSS-first）+ shadcn **4.16.1**（新默认样式 base-nova，底层 Base UI）
  - React Router **8.3.0**（库模式，`createBrowserRouter`）、TanStack Query 5.101、Zustand 5、Ky 2、sonner、date-fns 4、react-hook-form + zod 4
  - Vitest 4 + RTL 16 + jsdom 30；ESLint 10 flat config + Prettier
- **shadcn 基础组件**：button/input/label/textarea/card/dialog/dropdown-menu/sheet/tooltip/badge/separator/skeleton/sonner。
- **feature 骨架目录**：`app/`、`features/{diary,moment,blob,task,event}/`、`api/`、`components/ui`+common、`stores/`、`messages/`、`config/`、`test/` 等，附壳层（providers/router/layout）可跑。
- **验证**：根 `bun run typecheck`、根 `bun run test`、`apps/web` 的 build/test/lint 全过；dev server `HTTP 200`。

## 对下一次会话的提示（pitfalls）

1. **TypeScript 7.0.2 是 npm latest，但不能用**：`typescript-eslint@8.66` peer 是 `<6.1.0`，TS7 配不上 ESLint 工具链。web 端锁定 `~5.9.3`，与根 `^5.9.3` 对齐，bun 提升不打架。升级 TS 前先确认 typescript-eslint 支持。
2. **shadcn v4 已从 Radix 换成 Base UI**：组件 import `@base-ui/react/*`（子路径），不是 `@radix-ui/*`。且 `shadcn add` 在本仓库**没把依赖写进 package.json**——必须手动 `bun add @base-ui/react`，否则组件 import 无法解析。
3. **`shadcn add form` 静默无操作**：base-nova 风格下 form 组件的 registry 项是空壳（`files: []`）。表单直接用 RHF + zod + input/label 手写即可（更通用），或等该风格补全/切换风格。
4. **React Router 8**：要求 React ≥19.2.7、Node ≥22.22。安装包用 `react-router`（v8）；`react-router-dom` 已冻结在 v7 作 shim，别装它。
5. **Vite dev 代理** `/api → http://localhost:3000` 已配；`VITE_API_BASE_URL` 默认空（同源相对路径）。生产按「静态 SPA + 反代 /api」走。
6. **根 `.gitignore`** 已加 `apps/web/dist/`。
7. 尚未接入：真实 API 调用（feature 的 api.ts/queries.ts）、鉴权（API 暂无，client.ts 留了 token 位点）、部署方式、CLAUDE.md 的 Web 小节。
