# 2026-08-06 — 事件（日程）模块前端（apps/web）

在 `apps/web` 实现事件 feature 前端。Event 模块的 API / MCP / CLI 已于 08-05 全部落地（见 `.ai/worklog/2026-08-05-event-module-implementation.md`），本次**零后端改动**，仅补前端 + CLAUDE.md 路由表。

## 本次完成（`apps/web`）

- **`stores/event-ui.ts`**：zustand UI store（对齐 `moment-draft` 先例）——`viewedDate`（当前查看日期，新建弹窗默认日期来源）+ `createOpen` / `editingEvent`（顶栏「新建日程」与页面编辑入口共用）。
- **`features/event/`** 完整骨架：
  - `api.ts`：EventEntry + list/create/get/update/delete。**列表返回裸数组**（`unwrap<EventEntry[]>`），不套 `Paged`。
  - `lib.ts` 纯函数：`dayWindow`（本地当日 `[00:00, 次日00:00)` 窗口）、`shiftDate`（±N 天，正午构造避免夏令时抖动）、`toLocalISO` / `toLocalInputValue`（datetime-local ↔ ISO 本地时区互转）、`eventTimeLabel`（全天/时段）、`sortEvents`。
  - `schemas.ts`：`eventFormSchema`（title 必填 ≤200、startAt/endAt 必填、`end>start` refine、location/note 可选）。
  - `queries.ts`：`useEvents(date)`（按日窗口）+ create/update/delete mutation，前缀 invalidate `['events']`。
  - `components/`：`event-nav`（「日程」+「新建日程」）、`event-date-nav`（日期栏过滤：`<input type="date">` + ◀今天▶）、`event-list`（加载/错/空态 + 卡片）、`event-item`（时间徽标 + 标题 + 📍地点 + 备注截断 + ⋯编辑/删除 + 确认弹窗）、`event-form-dialog`（新建/编辑合一，全字段 + 全天开关）。
  - `pages/event-page.tsx`：单日视图薄壳（居中 `max-w-[600px]`，对齐 diary/moment）。
- **接线**：路由 `/event`（`handle.nav: <EventNav/>`）+ 侧边栏「日程」（`CalendarDays`，插在 日记 与 任务 之间）。
- **CLAUDE.md**：模块树 + 路由表补 task / event 两模块，field-naming gotcha 加 event 一行（`title/startAt/endAt/isAllDay/location/note`、列表裸数组）。
- 测试：api / schemas / lib / queries / event-item / event-form-dialog 共 38 新用例（vitest）。

## 验证

- 根 `bun run typecheck` ✓（api + mcp + web）；根 `bun run test` ✓（110 用例）。
- `apps/web`：typecheck ✓、test ✓（30 文件 110 用例）、lint 0 error（6 warning，全为既有 `react-hook-form watch()` 模式，本 feature 新增 1 条）、`vite build` ✓（event-page 独立分包）。
- 手动冒烟（对运行中 Docker API）：create（+08:00→UTC）、本地单日窗口 list（裸数组命中）、delete 204，全符合前端假设。

## 对下一次会话的提示（pitfalls）

1. **event 列表是裸数组**，不是 `{items,total}`：`listEvents` 直接 `unwrap<EventEntry[]>`，查询 hooks 无分页循环；这是 event 与 diary/moment/task 的关键差异。
2. **全天事件必须归一 00:00–23:59**：`EventFormDialog` 勾选「全天」时立即 `setValue` start/end 为 `T00:00`/`T23:59`，否则沿用时段默认值（09:00）提交——这是本 feature 实现中发现并修掉的真实 bug，测试 `勾选全天后提交用 00:00–23:59` 兜住。
3. **单日窗口用本地时区**：`dayWindow` 用 `new Date(y,m-1,d)` 本地午夜 → `toISOString()`（Z）。后端 `z.iso.datetime({offset:true})` 接受 Z；时区口径与「今天」（`todayLocal`）一致，区别于 diary 的 UTC `todayUTC`（diary 的「今天」是后端 by-date 语义，event 是本地日程）。
4. **base-ui DropdownMenu 菜单项在 portal 异步渲染**：event-item 测试里点开 ⋯ 后要用 `await screen.findByText(...)` 而非 `getByText`，否则偶发「Unable to find」（首次用 getByText 失败过）。
5. **跨组件 UI 态放 zustand，服务端数据不进 store**：`viewedDate` 放 store 是为了顶栏「新建日程」能取到当前查看日期做弹窗默认值；服务端数据仍只走 TanStack Query。
6. **React Query v5 mutation 第二参**：`toHaveBeenCalledWith(input)` 会 miss（mutate 会带 context 第二参），用 `mock.calls[0][0]` 断言首参（同 task 坑 ⑤）。
