# 2026-08-06 — 任务模块前端（apps/web）

在 `apps/web` 实现任务 feature 前端。UI 参照 `serenique-test/apps/web` 的任务模块（该处有固定分组 + 截止时间 + 提醒），**按「只有自定义组 + 简单任务」裁掉**：无 type（无 YEAR/MONTH/WEEK/DAY 固定分组）、无 deadline、无 description、无 reminders、无分组详情页。API/MCP/CLI 任务接口已齐全（见 08-05 task 模块），前端零补齐，无需开子代理。

## 本次完成（`apps/web`）

- **`components/ui/checkbox.tsx`**：新增 base-ui `Checkbox` UI 组件（shadcn base-nova 风格），任务勾选用。
- **`features/task/`** 完整骨架：
  - `api.ts`：任务组 CRUD + 任务 CRUD。对齐现状：`title`（非 content）、`status` todo/done/abandon、`completedAt` 由服务端按 status 自动同步（前端不传）、列表返回 `{ items, total }` 分页包。
  - `schemas.ts`：`taskGroupFormSchema` / `taskFormSchema`（title 必填，trim + min(1).max(200) 对齐后端）。
  - `lib.ts`：`taskStatusLabel`（待办/已完成/已放弃）+ `sortTasks`（待办→已完成→已放弃稳定排序）。
  - `queries.ts`：`useTaskGroups`（全量循环拉取）、`useTasks(groupId)`（按组过滤，`enabled: !!groupId`）、6 个 mutation。写入统一前缀 invalidate `['task-groups']` / `['tasks']`。
  - `components/`：`task-nav`（顶栏标题）、`task-group-panel`（桌面左栏）+ `task-group-item`（选中/重命名/删除）+ `task-group-dialog`（新建/重命名合一）、`task-group-chips`（移动端横向 chips）、`task-list`（右栏）+ `task-item`（勾选/修改/移动/放弃重建/删除）+ `task-create-input`（底部内联新增）、`task-rename-dialog`、`task-move-dialog`、`task-confirm-dialog`（通用二次确认）。
  - `pages/task-page.tsx`：桌面左面板 + 右列表；移动端 chips 选组。选中态本地 state，任务组被删自动回退到第一个组。
- 路由 `/task`（`handle.nav: <TaskNav/>`）+ 侧边栏「任务」（ListTodo 图标）。
- 测试：api / schemas / lib / queries / task-item / task-create-input 共 30 新用例（vitest）。

## 验证

- 根 `bun run typecheck` ✓（api + mcp + web）；根 `bun run test` ✓（MCP + Web 24 文件 68 用例）。
- `apps/web`：typecheck ✓、test ✓、lint 0 error（5 条为 diary/moment 既有 `react-hook-form watch()` 警告）、prettier ✓、`vite build` ✓（task-page 懒加载分包）。

## 对下一次会话的提示（pitfalls）

1. **前端任务列表 = 两个查询，不依赖组内嵌任务**。API `GET /api/task-groups` 不返回 tasks、`GET /api/tasks?groupId=` 才按组过滤。前端 `useTaskGroups()` + `useTasks(groupId)` 分开拉，按前缀 invalidate 联动。
2. **`completedAt` 只读**：由服务端 `nextCompletedAt` / `resolveTaskUpdate` 根据 status 自动同步。前端 toggle 只发 `{ status: 'done' | 'todo' }`，不要带 completedAt。
3. **列表页顺序**：API 按 createdAt 倒序，前端再 `sortTasks` 把待办排最前（todo → done → abandon 稳定排序）。展示完成时间用 `formatDate(task.completedAt)`。
4. **组选中态**：`selectedGroupId` 存任务页本地 state，`groups.find(...) ?? groups[0]` 兜底——删除当前组后自动落到第一个组，无需 effect 同步 store。
5. **写 queries 测试**：React Query v5 `mutationFn` 会被传入第二个 context 参数，`toHaveBeenCalledWith(input)` 会 miss。用 `mockedFn.mock.calls[0][0]` 断言首参。
6. **移动端**：桌面左面板 `hidden sm:flex`，移动端用 `sm:hidden` 的横向 chips 行（`TaskGroupChips`）选组，避免为组管理单开一页。
7. 根测试仍走 `bun run test`（vitest），裸 `bun test` 用 Bun 原生测试器会扫 web 用例报假失败（见 08-05 diary worklog pitfall 1）。
8. 工作区有他人并行改动（moment 评论模块：`services/api` 的 comment.* + 迁移 0008）——本 feature 未触碰，commit 时按目录区分。
