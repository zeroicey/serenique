# Web 前端技术栈决策（Web Frontend Tech Stack）

日期: 2026-08-05（2026-08-15 更新：删除已过时的「鉴权暂不做」决策——2026-08-06 已实现 passkey + token 鉴权，见 `.ai/requirements/2026-08-06-auth.md`）

适用范围: `apps/web`（Serenique 浏览器端前端）

## 技术栈（定稿）

1. **运行时与构建**：Bun + Vite（`@vitejs/plugin-react`）+ React 19 + TypeScript strict
2. **样式**：Tailwind CSS v4 + shadcn/ui + `next-themes`（dark mode）+ `lucide-react`（图标）
3. **路由**：React Router v7（declarative + `createBrowserRouter` + 路由懒加载）
4. **数据与状态**：Ky 统一解包响应；TanStack Query v5 管服务端状态（Query key 按模块命名、mutation 成功 invalidate）；Zustand v5 只放 UI/会话状态，**不放服务端数据**
5. **表单**：react-hook-form + zod（与 API 的 zod 校验语义一致，shadcn Form 组件配套）
6. **工具**：sonner（Toast）、date-fns（日期格式化）

## 决策点结论

- **界面语言：中文硬编码**，文案直接写在对应组件内，不集中管理、暂不引入 i18n（2026-08-05 用户决策：删除 `src/messages/`）。
- **表单：react-hook-form + zod**。Why：shadcn Form 基于 RHF，与 API zod 语义对齐；自研受控表单复杂表单重复代码多。
- **测试：Vitest + React Testing Library**（单测/组件测试），不引入 Playwright E2E。Why：与仓库「纯逻辑毫秒级单测 + 关键路径集成测试」文化一致。
- **鉴权：已演进**（原「暂不做」已过时）——passkey 登录 + Bearer token，见 auth 相关 requirements/architecture。

## 硬约束

- 根 `package.json` workspaces **显式加 `"apps/web"`**，不能写 `"apps/*"`（`apps/cli` 是 Go）
- 路径别名 `@/*` → `src/*`
- Base URL 走 `VITE_API_BASE_URL`；dev 用 Vite proxy `/api → http://localhost:3000`
- **web 端类型手动定义**，不 import `@serenique/api`（service 层带 DB 依赖）
- 用户可见文案为中文，直接内联在组件内

## 已否决选项（一句话）

i18n 框架（现在做过度）、共享口令鉴权（范围外，已演进为 passkey）、自研表单替代 RHF（复杂表单重复代码多）、Playwright E2E（按需再加）。
