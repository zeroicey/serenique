# Web 前端 — 事件（日程）模块设计（2026-08-06）

状态: **已确认，待实施**
适用范围: `apps/web`（浏览器端）— **不改后端**。Event 模块的 API / MCP / CLI 已全部落地（见 `.ai/worklog/2026-08-05-event-module-implementation.md`），本次仅做前端 + CLAUDE.md 路由表补充。
前置: 技术栈与目录见 [[2026-08-05-web-frontend-tech-stack]] / [[2026-08-05-web-frontend-architecture]]。事件后端契约见 `services/api/src/modules/event/*`（`EventEntry`、裸数组列表、`z.iso.datetime({offset:true})`）。
设计参考: `features/task/`（弹窗表单、本地选中态）、`features/diary/`（日期语义、单日视图）、`features/moment/`（卡片 + 下拉菜单 + 删除确认、顶栏动态导航）。

---

## 1. 已确认决策（用户拍板）

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 页面视图 | **单日视图**：默认今天，顶部日期栏（前一/今天/后一 + 日期选择器）切换；过滤 = 所选日期。符合「仅单条/单日事件、无重复」现状 |
| ② | 弹窗字段 | **全字段**：标题 + 开始/结束时间 + 全天开关 + 地点 + 备注（用满现有 API 能力） |
| ③ | 模块名称 | 侧边栏/顶栏用 **「日程」**（与「闪念/日记/任务」风格一致）；API/MCP/CLI 内部仍叫 event |
| ④ | 弹窗状态 | 用 **zustand store**（`stores/event-ui.ts`，对齐 `moment-draft` 先例）——顶栏「新建日程」按钮与页面编辑入口共用；服务端数据不进 store |
| ⑤ | API 评估 | **现有 API 已够用，零后端改动** → 不改 MCP / CLI → **不需要开子代理** |
| ⑥ | CLAUDE.md | 顺手补全路由表缺失的 event / task 两行（纯文档） |

---

## 2. 页面设计（单日视图）

```
┌─ 顶栏（navbar 动态槽）──────────────────────┐
│ 日程                       [ ＋ 新建日程 ]  │
├─────────────────────────────────────────────┤
│  ◀  2026-08-06 [📅日期选择]  今天  ▶        │  ← 过滤表单 = 日期栏
├─────────────────────────────────────────────┤
│                                             │
│  09:00 – 10:00   晨会                       │  ← 时段事件卡片
│  全天             出差深圳 · 📍深圳          │  ← 全天事件卡片
│  14:30 – 15:00   产品评审 · 备忘截断…        │
│                                             │
│              （空态）今天没有日程             │
└─────────────────────────────────────────────┘
```

- 路由 `/event`，`handle: { nav: <EventNav /> }`；侧边栏在「日记」与「任务」之间加 **日程**（`CalendarDays` 图标）。
- 布局对齐 diary/moment：居中列 `max-w-[600px]`；加载（`Loader2`）/ 错误（重试按钮）/ 空态三态齐全。

---

## 3. 组件与数据流（`apps/web/src/features/event/`）

### 3.1 API 契约（手动定义，对齐后端）

`EventEntry = { id, title, startAt, endAt, isAllDay, location: string|null, note: string|null, createdAt, updatedAt }`，时间为 ISO 字符串。

```
GET    /api/events?from=<ISO>&to=<ISO>   → EventEntry[]   // 裸数组！非 {items,total}
POST   /api/events                       → { title, startAt, endAt, isAllDay?, location?, note? }
GET    /api/events/:id                   → EventEntry
PUT    /api/events/:id                   → 部分更新（至少一个字段；location/note 传空串=清空）
DELETE /api/events/:id                   → 204
```

- `api.ts`：`listEvents(from, to)`（Ky + `unwrap<EventEntry[]>`）、`createEvent` / `updateEvent` / `getEvent` / `deleteEvent`（204 守卫，对齐 `deleteDiary`）。
- **坑**：列表返回裸数组，**不要**套 `Paged<T>`。

### 3.2 queries.ts

- `useEvents(date)`：`useQuery(['events', date])`，`queryFn` 把日期换算成窗口后 `listEvents(from, to)`，返回 `EventEntry[]`（`staleTime` 30s）。
- `useCreateEvent` / `useUpdateEvent` / `useDeleteEvent`：成功 → `toast` 中文文案 + `invalidateQueries(['events'])`（写入统一前缀 invalidate，对齐 task）。
- `useUpdateEvent` 参数 `{ id, patch }`：前端只传**变更字段**（对齐后端 PUT 至少一项语义）。

### 3.3 schemas.ts（RHF + zod）

```
eventFormSchema = z.object({
  title:   z.string().trim().min(1, '标题不能为空').max(200),
  startAt: z.string().min(1, '请选择开始时间'),   // datetime-local 字符串，提交前转 ISO
  endAt:   z.string().min(1, '请选择结束时间'),
  isAllDay: z.boolean(),
  location: z.string().trim().max(200).optional(),
  note:     z.string().trim().max(2000).optional(),
}).refine((v) => new Date(v.endAt) > new Date(v.startAt), {
  path: ['endAt'], message: '结束时间必须晚于开始时间',
})
```

> 表单层字段用本地 `datetime-local` 字符串（含 date），提交时 `toLocalISO` 转 ISO；end>start 前端先用 `Date` 比较拦截，后端 domain + DB CHECK 兜底。

### 3.4 lib.ts（纯函数，单测友好）

- `dayWindow(date: string): { from: string; to: string }` — 本地时区 `[date 00:00, 次日 00:00)`，转 ISO（带本地 offset，`z.iso.datetime({offset:true})` 可接受）。
- `eventTimeLabel(event): string` — `isAllDay → '全天'`；否则本地 `HH:mm – HH:mm`。
- `sortEvents(a, b)` — `startAt` 升序（对齐 API 排序，前端兜底）。
- `toLocalInputValue(iso): string` — ISO → `YYYY-MM-DDTHH:mm`（编辑回填 `datetime-local`）。
- `toLocalISO(inputValue): string` — `datetime-local` 字符串 → ISO（`new Date(v).toISOString()`，Z 格式后端接受）。

### 3.5 components/

| 组件 | 职责 |
|------|------|
| `event-nav.tsx` | 顶栏动态导航：标题「日程」+「新建日程」按钮（`openCreate()`） |
| `event-date-nav.tsx` | **过滤表单**：`<input type="date">` + ◀ 今天 ▶；受控于页面 date state |
| `event-list.tsx` | 加载/空/错态 + 事件卡片列表 |
| `event-item.tsx` | 卡片：时间（含「全天」徽标）+ 标题 + 📍地点 + 备注（截断/展开）+ `⋯` 菜单（编辑/删除）+ 删除确认弹窗 |
| `event-form-dialog.tsx` | 新建/编辑合一弹窗（mode + editingEvent），见 §3.6 |

### 3.6 弹窗（`EventFormDialog`）

- 字段：标题* / 开始时间 / 结束时间 / 全天开关（勾选后隐藏时间、只显示日期）/ 地点 / 备注。
- 状态驱动：`useEventUIStore`（`stores/event-ui.ts`）——`{ createOpen, editingEvent, openCreate(), openEdit(e), close() }`。
- 新建 → `createEvent`；编辑 → `updateEvent(id, 变更字段)`；成功后 `close()` + toast + invalidate。
- **新建默认日期 = 当前查看的日期**：`openCreate()` 从 store 读取当前查看日期，表单 start/end 初始化为该日（默认 09:00–10:00），避免在别的日期视图里建错日子。
- 编辑回填：`startAt/endAt` 经 `toLocalInputValue` 填 `datetime-local`；`location/note` 空值显示空。
- 提交转换：`toLocalISO`；全天事件存当日窗口内（本地 `start=00:00`、`end=23:59:59`，`end>start` 满足），显示只出日期 + 「全天」徽标。

---

## 4. 接线（`apps/web` 全局层）

- `app/router.tsx`：追加 `/event` lazy 路由 + `handle: { nav: <EventNav /> }`。
- `components/common/app-sidebar.tsx`：在「日记」与「任务」之间插入「日程」（`CalendarDays`），`/event`。
- `stores/event-ui.ts`：新建（zustand，UI 态，对齐 `stores/moment-draft.ts`）。
- `lib/format.ts`：新增 `formatTime(iso): string`（`HH:mm`，本地时区）——事件时间展示用，通用件放全局 lib。
- **不改** `welcome-page.tsx`（任务模块也尚未加入口卡片，保持一致）。

---

## 5. 测试

- `api.test.ts`：list（裸数组解码）/ create / update / delete 204 守卫。
- `schemas.test.ts`：标题空/超长、end ≤ start、全天路径。
- `lib.test.ts`：`dayWindow`（本地时区边界、跨日）、`eventTimeLabel`（全天/时段）、`toLocalISO` 往返。
- `queries.test.tsx`：`useEvents` 拉裸数组 + 窗口参数；mutation invalidate（`mockedFn.mock.calls[0][0]`，见 task 坑 ⑤）。
- `event-item.test.tsx`：全天徽标、时间文案、编辑/删除入口。
- `event-form-dialog.test.tsx`：新建提交 POST、编辑预填 PUT、end≤start 拦截。
- 遵循 web 测试约定：`bun run test`（vitest）、mock `@/api/client`、`renderWithProviders`。

---

## 6. 实施顺序

单流（仅 `apps/web` + 文档，**无后端改动 → 无子代理**）：

1. `stores/event-ui.ts` + `lib/format.ts(formatTime)`
2. `features/event/api.ts` → `schemas.ts` → `lib.ts`（含单测）
3. `features/event/queries.ts`（含单测）
4. `features/event/components/*` + `pages/event-page.tsx`（含组件测试）
5. 接线：`router.tsx` / `app-sidebar.tsx`
6. 补 CLAUDE.md 路由表（event + task 两行）
7. 全量验证：根 `bun run typecheck`、根 `bun run test`、`cd apps/web && bun run lint && bun run build`

不提交 git 前先本地全绿。

---

## 7. 待确认 / 已延期（明确不做，防止回潮）

- 周/月日历视图：数据量小时不做，等需求。
- 事件重复（recurring）规则：需求明确「无重复」，不做。
- 事件提醒（reminder）：API 无此字段，不做。
- 欢迎页入口卡片：任务模块也未加，保持一致暂不加。
- 跨日事件在单日视图中的时间展示细化（如「昨天 23:00 – 今天 01:00」）：本次按 `HH:mm – HH:mm` 简化展示，后续按需。
