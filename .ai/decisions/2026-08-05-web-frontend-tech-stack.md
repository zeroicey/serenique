# Web 前端技术栈决策（Web Frontend Tech Stack）

日期: 2026-08-05

适用范围: `apps/web`（Serenique 浏览器端前端）

## 背景

为 Serenique 增加浏览器端界面，消费同一套 REST API（diary / moment / blob / task / event）。API 侧现状约束：

- 统一响应 `{ success, message, data?, error? }`，消息为中文。
- **当前无鉴权**（部署 worklog 明确记录），token 未设。
- 无 OpenAPI 输出，web 端请求/响应类型需手动定义。
- 根 `package.json` workspaces 当前为 `["services/*"]`；`apps/cli` 是 Go，不能进 bun workspaces。

在既定基础栈（Bun / Vite / shadcn+tailwind / React Router / Ky / TanStack Query / Zustand）之上，有 4 个开放决策点需定夺：鉴权、界面语言、表单方案、测试范围。

## 决策

1. **运行时与构建**：Bun + Vite（`@vitejs/plugin-react`）+ React 19 + TypeScript strict。
2. **样式**：Tailwind CSS v4 + shadcn/ui + `next-themes`（dark mode）+ `lucide-react`（图标）。
3. **路由**：React Router v7（declarative + `createBrowserRouter` + 路由懒加载）。
4. **数据与状态**：Ky 统一解包响应；TanStack Query v5 管服务端状态（Query key 按模块命名、mutation 成功 invalidate）；Zustand v5 只放 UI/会话状态，不放服务端数据。
5. **表单**：react-hook-form + zod（与 API 的 zod 校验语义一致，shadcn Form 组件配套）。
6. **工具**：sonner（Toast）、date-fns（日期格式化）。

### 4 个决策点结论

- **鉴权：暂不做**。与 API 现状一致（个人局域网自用）。客户端 `api/client.ts` 预留 token 注入位点，后续 API 加鉴权后再接。

  **Why**：API 无鉴权是现成事实，本次范围专注前端；加鉴权要么改后端（扩范围）要么引共享口令（前后端都动）。留注入位点即可，将来成本最低。

  **How to apply**：Ky 实例在请求钩子里预留 `token` 位（当前为空），不要写死鉴权逻辑。

- **界面语言：中文硬编码**，文案集中到一个文件（`src/messages/`），暂不引入 i18n 框架。

  **Why**：个人应用、API 消息即中文，i18n 是纯样板代码；集中文案后将来要国际化只是换渲染层。

  **How to apply**：所有用户可见文案进 `messages/`，组件里 import 使用，不要散落字符串。

- **表单：react-hook-form + zod**。

  **Why**：shadcn Form 即基于 RHF，与 API zod 校验语义对齐；自研受控表单在复杂表单（校验/错误展示）上重复代码多。

  **How to apply**：页面级表单用 RHF，`zodResolver` 接 zod schema；schema 与 API 字段契约同源命名。

- **测试：Vitest + React Testing Library**（单测/组件测试），不引入 Playwright E2E。

  **Why**：与仓库"纯逻辑毫秒级单测 + 关键路径集成测试"的文化一致；E2E 重且要 CI 浏览器环境，按需再加。

  **How to apply**：组件测试覆盖核心交互；API/Query 层用 mock 隔离；`test/setup.ts` 配 jsdom + RTL。

## 硬约束

- 根 `package.json` workspaces **显式加 `"apps/web"`**，不能写 `"apps/*"`（`apps/cli` 是 Go）。
- 路径别名 `@/*` → `src/*`（与 API 一致）。
- Base URL 走 `VITE_API_BASE_URL`；dev 用 Vite proxy `/api → http://localhost:3000` 避开 CORS。
- **web 端类型手动定义**，不 import `@serenique/api`（那是带 DB 的 service 层，会拖入数据库依赖）。
- 部署方式未定，按「静态构建 SPA + 反向代理 `/api`」设计，留口子。
- 用户可见文案为中文，统一走 `messages/`。

## 已否决选项（一句话）

i18n 框架（现在做过度）、给 API 加鉴权/共享口令（本次范围外）、自研表单替代 RHF（复杂表单重复代码多）、Playwright E2E（本次范围外，后续按需）。
