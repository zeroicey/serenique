# 2026-08-13 — 任务组选择器迁移到全局顶栏下拉（Web 端）

任务组选择器从「桌面左侧 TaskGroupPanel + 移动端 TaskGroupChips」改为「全局顶栏右上角下拉框」，外观/交互完全参照 AI 会话选择器 SessionSwitcher（`features/ai/components/session-switcher.tsx`）。只改 apps/web，不动其他模块。

## 改动（apps/web，未提交）

- **新增 `features/task/store/task-store.ts`**：zustand store，仅存 `selectedGroupId: string | null` + `setSelectedGroupId(id)`。任务组列表/任务列表仍走 TanStack Query（`useTaskGroups`/`useTasks`），服务端数据不进 store（前端架构硬约束）。仿 `features/ai/store/ai-store.ts` 的 feature 内 store 先例。
- **新增 `features/task/components/task-group-switcher.tsx`**：
  - 触发按钮：`DropdownMenuTrigger render={<Button variant="outline" className="max-w-48" />}`，内容 `<span className="truncate">{当前任务组名}</span>` + `<span className="text-muted-foreground">▾</span>`；无任务组显示占位「选择任务组」（未显式选中时回退第一个任务组，与旧页面一致）
  - 面板：`DropdownMenuContent align="end" className="max-h-80 w-64"`（`max-h-80` 显式加固定上限，配合自带 `overflow-y-auto`，任务组多时可滚动，不依赖默认 `max-h-(--available-height)`；cn 的 twMerge 会把基类里的 `max-h-(--available-height)` 合并掉，最终生效 `max-h-80`）
  - 结构：第一项「新建任务组」（Plus，开 TaskGroupDialog mode="create"）→ Separator → 空态「还没有任务组」（`text-xs text-muted-foreground`，仅在 `groups && groups.length === 0` 时渲染，避免加载瞬间闪空态）→ 任务组列表
  - 选中项 `bg-primary/10` 高亮；点击某项 = 切换选中（存 store）并 `setOpen(false)`
  - 每项右侧 hover 显示两个操作按钮（`absolute`，`opacity-0 group-hover:opacity-100`）：重命名（SquarePen，`right-7`，`hover:text-foreground`，开 TaskGroupDialog mode="rename"）、删除（Trash2，`right-1`，`hover:text-destructive`，开 TaskConfirmDialog，文案「确定删除任务组「{title}」吗？组内所有任务会一并删除，且不可恢复。」destructive + useDeleteTaskGroup）；均 `e.stopPropagation()`，aria-label 中文
  - 局部 state：`open/createOpen/renameTarget/deleteTarget`，动作完成后 `setOpen(false)`
  - 创建/重命名/删除成功后沿用 queries.ts 现有 mutation 的 invalidate 逻辑（`['task-groups']` / `['tasks']`），未新增失效逻辑
- **`app/router.tsx`**：task 路由 handle 增加 `headerRight: <TaskGroupSwitcher />`（保留 `nav: <TaskNav />`），AppNavbar 经 useMatches 渲染右侧槽——与 ai 路由 `headerRight: <SessionSwitcher />` 同机制。
- **`features/task/pages/task-page.tsx`**：删除 TaskGroupPanel/TaskGroupChips 引用与本地 `useState`，改从 task-store 读 `selectedGroupId`；保留「未选中 → 回退第一个任务组」；TaskList 全宽渲染（保留原有 max-w-[960px] 居中列布局）。
- **删除** `task-group-panel.tsx`、`task-group-chips.tsx`、`task-group-item.tsx`（先 grep 确认无其他引用：仅 task-page 引 panel/chips、panel 引 item，均为本次移除/删除对象）。
- **`features/task/index.ts`**：barrel 补导出 `TaskGroupSwitcher`（与 TaskNav 同等待遇）。
- **新增 `features/task/components/task-group-switcher.test.tsx`**：8 例，覆盖触发按钮（占位/当前名/未选中回退第一个）、打开菜单列出任务组与新建入口、空态、点击切换选中态（断言 store）、新建/重命名对话框打开、删除确认后调用 deleteTaskGroup。写法参照 `session-switcher.test.tsx`，API 层 mock 参照 `queries.test.tsx`。

## 验证

- `cd apps/web && bun run typecheck` ✅
- `bun run test`（vitest）239/239 ✅，新增 8 例全过；既有 task 测试（task-item / task-create-input / api / queries / lib / schemas）不受影响
- `bun run build`（tsc + vite + PWA）✅
- `bunx eslint` 本次改动 6 文件 ✅ 无告警

## 坑 / 对下一次会话的提示

1. **`bun test` ≠ vitest（再次踩到，已有 worklog 记录仍易犯）**：apps/web 的 `test` 脚本是 `vitest run`；`bun test` 调 Bun 原生测试器会全套挂掉（`vi.mocked is not a function` / `document is not defined` / `vi.hoisted is not a function`），且所有测试文件报错完全一致，容易误判为"改动把测试弄坏了"。正确命令 `bun run test`。
2. **TanStack Query v5 mutationFn 会被调用两次参数**：`mutate(variables)` 最终调用 `mutationFn(variables, { client, meta, mutationKey })` 两个参数。断言 mutation 调用时不能 `toHaveBeenCalledWith('a')`，要取 `mock.calls[0][0]`（对齐 `queries.test.tsx` 既有写法）。`waitFor` 里 `expect(mockedDeleteGroup.mock.calls[0][0]).toBe('a')` 可用（waitFor 轮询期间 calls[0] 从 undefined 变为有值，`undefined[0]` 会抛错——用 `.mock.calls[0][0]` 在 waitFor 首次轮询时若还没调用会读到 `undefined[0]` 抛 TypeError 被 waitFor 吞掉重试，最终成功；若要绝对稳可在断言前加 `expect(mockedDeleteGroup).toHaveBeenCalled()`）。
3. **DropdownMenuContent 加 `max-h-80` 会被 twMerge 合并掉基类 `max-h-(--available-height)`**：cn 用 tailwind-merge，两个都是 max-h 组 → 保留后传入的 `max-h-80`。这正好满足「显式固定上限」的要求；不要写成 `max-h-(--available-height) max-h-80` 期望两者共存。
4. **store 单测残留**：zustand store 是模块级单例，组件测试里要 `afterEach(useTaskStore.setState({ selectedGroupId: null }))` 复位，否则用例间状态串扰（如「切换选中态」用例跑到「回退第一个」用例前面会把选中态带过去）。
5. 空态文案只在 `groups && groups.length === 0` 时渲染：查询 loading（groups undefined）期间只显示「新建任务组」+ 分隔线，不闪「还没有任务组」；测试断言空态要用 `findByText` 等待查询完成。

## 后续可选项（未做，超出本次范围）

- 删除任务组后若删除的是当前选中组，store 的 `selectedGroupId` 保持旧值、页面靠「回退第一个」兜底；将来可考虑在 delete 成功后把 `selectedGroupId` 清空/重置到第一个，语义更精确。

---

# 补充（同日）：任务列表 UI 精简——去边框化（用户反馈）

同一会话继续任务模块 UI 精简，全部在 `apps/web/src/features/task/`，未提交。

## 改动

- **`components/task-list.tsx`**：
  - 删除顶部任务组标题区（`<div className="border-b px-3 py-2"><h2>{group.title}</h2></div>`）——任务组名已由顶栏下拉 TaskGroupSwitcher 展示，页面内重复信息去掉。
  - 外层去 `rounded-md border`（→ `flex h-full flex-col`），整体不再有外框卡片；「请先创建一个任务组。」空态块去 `rounded-md border`（保持居中纯文字）；「暂无任务」空态原本就无边框，不动。
  - 任务条目容器改 `space-y-3`（条目间垂直间距，替代原 border-b 分隔线；moment 列表用 `my-3 w-full border-b` 分隔线，按用户要求任务用垂直间距更清爽）。
  - 滚动结构未破坏：`flex-1 overflow-auto` 原样保留。
- **`components/task-item.tsx`**：条目 `flex items-center gap-3 rounded-md border-b px-3 py-3` → `flex items-center gap-3 rounded-md px-3 py-3`（去掉 `border-b`，保留内边距；`bg-muted/40` 完成态底色 + `rounded-md` 保留，无边框时就是圆角高亮行）。
- **`components/task-create-input.tsx`**：外层 `flex items-center gap-2 border-t px-3 py-2` → 去 `border-t`，输入框 + 添加按钮一行直接呈现；`py-2` 保留作为与上方列表的少量间距（padding 而非边框分隔）。

## 验证

- `cd apps/web && bun run typecheck` ✅
- `bun run test`（vitest）239/239 ✅——task-item.test.tsx / task-create-input.test.tsx 只断言行为（勾选/按钮/文本），不依赖样式类，未受影响无需改
- `bun run build`（tsc + vite + PWA）✅
- `bunx eslint` 本次 3 文件 ✅ 无告警

## 提示

- 去边框后完成态任务行 `bg-muted/40` 横贯列表宽度（圆角），与 moment 无框风格一致；若后续想要内缩高亮，可在任务容器加 `p-3` 并把条目横向 padding 移到容器层，但当前观感已够。
