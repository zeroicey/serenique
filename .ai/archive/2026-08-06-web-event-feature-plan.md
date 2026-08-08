# Web 事件（日程）模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `apps/web` 实现事件（日程）feature 前端：单日视图 + 全字段新建/编辑弹窗 + 日期栏过滤，并补全 CLAUDE.md 路由表。

**Architecture:** 纯前端改动，零后端改动（API/MCP/CLI 的 event 已就绪）。严格对齐 `features/task/` 骨架：`api.ts`（Ky+unwrap）→ `queries.ts`（TanStack Query）→ `schemas.ts`（RHF+zod）→ `lib.ts`（纯函数）→ `components/` → `pages/`。弹窗状态放 zustand store（对齐 `stores/moment-draft.ts`）。

**Tech Stack:** React 19 + Vite, TanStack Query v5, react-hook-form + zod, zustand, base-ui + shadcn 原语, vitest。

## Global Constraints

- 请求/响应类型**手动定义**，不 import `@serenique/api`。
- 用户可见文案**中文**，内联在组件中。
- 服务端数据只走 TanStack Query，不进 zustand。
- `GET /api/events` 返回**裸数组** `EventEntry[]`，**不要**套 `Paged<T>`。
- 时间为 ISO 字符串；`startAt/endAt` 提交用 `new Date(v).toISOString()`（Z），后端 `z.iso.datetime({offset:true})` 接受。
- 端到端验证：根 `bun run typecheck` + 根 `bun run test`（vitest）+ `cd apps/web && bun run lint && bun run build`。
- 不提交 git 前先本地全绿；commit 按目录/范围分开。

---

## 文件结构

**新建（apps/web/src/）：**
- `stores/event-ui.ts` — 弹窗 + 当前查看日期（UI 态）
- `features/event/api.ts`、`queries.ts`、`schemas.ts`、`lib.ts`、`index.ts`
- `features/event/components/event-nav.tsx`、`event-date-nav.tsx`、`event-list.tsx`、`event-item.tsx`、`event-form-dialog.tsx`
- `features/event/pages/event-page.tsx`
- 测试：`features/event/api.test.ts`、`schemas.test.ts`、`lib.test.ts`、`queries.test.tsx`、`components/event-item.test.tsx`、`components/event-form-dialog.test.tsx`

**修改：**
- `lib/date.ts` — 加 `todayLocal()`
- `lib/format.ts` — 加 `formatTime(iso)`（含测试 `lib/format.test.ts`）
- `app/router.tsx` — 注册 `/event`
- `components/common/app-sidebar.tsx` — 加「日程」
- `CLAUDE.md` — 路由表 + 模块树补 event/task

---

### Task 1: `lib/date.ts` + `lib/format.ts` 通用工具

**Files:**
- Modify: `apps/web/src/lib/date.ts`
- Modify: `apps/web/src/lib/format.ts`
- Test: `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Produces: `todayLocal(): string`（本地时区 YYYY-MM-DD）；`formatTime(iso: string): string`（本地 HH:mm）。

- [ ] **Step 1: 写测试** — 在 `lib/format.test.ts` 加 `formatTime` 用例（用固定本地时区构造：`new Date(2026, 7, 6, 9, 5).toISOString()` → `09:05`；用 `new Date(2026, 7, 6, 23, 59)` → `23:59`）。
- [ ] **Step 2: 跑测试确认失败** — `cd apps/web && bun run test lib/format.test.ts`，FAIL（formatTime 未定义）。
- [ ] **Step 3: 实现**
```ts
// lib/date.ts 追加
/** 今天（本地时区，YYYY-MM-DD）。事件单日视图用本地日界。 */
export function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// lib/format.ts 追加（formatDate 同款写法）
/** 时间格式：HH:mm（本地时区）。 */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mi}`
}
```
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/lib/date.ts apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts && git commit -m "feat(web): add todayLocal and formatTime helpers"`

---

### Task 2: `stores/event-ui.ts`

**Files:**
- Create: `apps/web/src/stores/event-ui.ts`

**Interfaces:**
- Consumes: `todayLocal()`（Task 1）、`EventEntry`（Task 3 类型；本任务先用 `import type` 前向声明，Task 3 落地后生效）。
- Produces: `useEventUIStore` — `{ viewedDate, setViewedDate, createOpen, editingEvent, openCreate, openEdit, close }`。

- [ ] **Step 1: 实现（小文件，无独立测试，随组件测试覆盖）**
```ts
import { create } from 'zustand'
import { todayLocal } from '@/lib/date'
import type { EventEntry } from '@/features/event/api'

interface EventUIState {
  /** 当前查看日期（YYY-MM-DD）；新建弹窗默认值来源。 */
  viewedDate: string
  setViewedDate: (date: string) => void
  createOpen: boolean
  editingEvent: EventEntry | null
  openCreate: () => void
  openEdit: (event: EventEntry) => void
  close: () => void
}

export const useEventUIStore = create<EventUIState>((set) => ({
  viewedDate: todayLocal(),
  setViewedDate: (date) => set({ viewedDate: date }),
  createOpen: false,
  editingEvent: null,
  openCreate: () => set({ createOpen: true, editingEvent: null }),
  openEdit: (event) => set({ editingEvent: event, createOpen: true }),
  close: () => set({ createOpen: false, editingEvent: null }),
}))
```
- [ ] **Step 2: Commit** — `git add apps/web/src/stores/event-ui.ts && git commit -m "feat(web): event dialog UI store"`

---

### Task 3: `features/event/api.ts`

**Files:**
- Create: `apps/web/src/features/event/api.ts`
- Test: `apps/web/src/features/event/api.test.ts`

**Interfaces:**
- Produces: `EventEntry`、`CreateEventInput`、`UpdateEventInput`、`listEvents(from, to): Promise<EventEntry[]>`、`createEvent(input)`、`getEvent(id)`、`updateEvent(id, input)`、`deleteEvent(id): Promise<void>`。

- [ ] **Step 1: 写失败测试** — 对齐 `features/blob/api.test.ts` 的 mock 模式（`vi.mock('@/api/client')` 返回 `{ api: { get/post/put/delete: vi.fn() } }` + mock `apiUrl`）。用例：`listEvents` 传 `{ from, to }` searchParams 并解出**裸数组**；`deleteEvent` 204 守卫（`{ status: 204 }` 不调用 unwrap）。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**
```ts
import { api, apiUrl } from '@/api/client'
import { unwrap } from '@/api/unwrap'

export interface EventEntry {
  id: string
  title: string
  startAt: string
  endAt: string
  isAllDay: boolean
  location: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEventInput {
  title: string
  startAt: string
  endAt: string
  isAllDay?: boolean
  location?: string
  note?: string
}

export interface UpdateEventInput {
  title?: string
  startAt?: string
  endAt?: string
  isAllDay?: boolean
  location?: string
  note?: string
}

// 列表返回裸数组（时间窗口查询，无分页）——不要套 Paged<T>。
export async function listEvents(from: string, to: string): Promise<EventEntry[]> {
  const res = await api.get(apiUrl('events'), { searchParams: { from, to } })
  return unwrap<EventEntry[]>(res)
}

export async function createEvent(input: CreateEventInput): Promise<EventEntry> {
  const res = await api.post(apiUrl('events'), { json: input })
  return unwrap<EventEntry>(res)
}

export async function getEvent(id: string): Promise<EventEntry> {
  const res = await api.get(apiUrl(`events/${id}`))
  return unwrap<EventEntry>(res)
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<EventEntry> {
  const res = await api.put(apiUrl(`events/${id}`), { json: input })
  return unwrap<EventEntry>(res)
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await api.delete(apiUrl(`events/${id}`))
  if (res.status === 204) return
  await unwrap(res)
}
```
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/features/event/api.ts apps/web/src/features/event/api.test.ts && git commit -m "feat(web): event api contract (bare-array list)"`

---

### Task 4: `features/event/lib.ts`

**Files:**
- Create: `apps/web/src/features/event/lib.ts`
- Test: `apps/web/src/features/event/lib.test.ts`

**Interfaces:**
- Consumes: `formatTime`（Task 1）、`EventEntry`（Task 3）。
- Produces: `dayWindow(date)`、`toLocalISO(inputValue)`、`toLocalInputValue(iso)`、`eventTimeLabel(event)`、`sortEvents(a, b)`。

- [ ] **Step 1: 写失败测试**
  - `dayWindow('2026-08-06')` → 本地午夜 `[00:00, 次日00:00)` 的两个 ISO（断言 `new Date(from).getHours()===0` 且 `to - from === 24h`）。
  - `toLocalISO('2026-08-06T09:00')` → 本地 09:00 的 Z ISO（`new Date(res).getHours()===9`）。
  - `toLocalInputValue(iso)` → `YYYY-MM-DDTHH:mm`（本地）。
  - `eventTimeLabel`：`isAllDay:true` → `'全天'`；时段 → `'HH:mm – HH:mm'`。
  - `sortEvents`：乱序 → `startAt` 升序。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**
```ts
import { formatTime } from '@/lib/format'
import type { EventEntry } from './api'

/** YYYY-MM-DD（本地）→ 当日窗口 [00:00, 次日00:00) 的 ISO（Z，后端接受）。 */
export function dayWindow(date: string): { from: string; to: string } {
  const [y, m, d] = date.split('-').map(Number)
  return {
    from: new Date(y, m - 1, d, 0, 0, 0).toISOString(),
    to: new Date(y, m - 1, d + 1, 0, 0, 0).toISOString(),
  }
}

/** datetime-local 字符串（YYYY-MM-DDTHH:mm，无偏移，按本地解释）→ ISO。 */
export function toLocalISO(inputValue: string): string {
  return new Date(inputValue).toISOString()
}

/** ISO → datetime-local 字符串（本地时区，编辑回填）。 */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}T${hh}:${mi}`
}

/** 事件时间标签：全天 → '全天'；时段 → 'HH:mm – HH:mm'（本地时区）。 */
export function eventTimeLabel(
  event: Pick<EventEntry, 'isAllDay' | 'startAt' | 'endAt'>,
): string {
  if (event.isAllDay) return '全天'
  return `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`
}

/** startAt 升序（前端兜底，对齐 API 排序）。 */
export function sortEvents(a: EventEntry, b: EventEntry): number {
  return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
}
```
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/features/event/lib.ts apps/web/src/features/event/lib.test.ts && git commit -m "feat(web): event pure helpers (dayWindow/time/format/sort)"`

---

### Task 5: `features/event/schemas.ts`

**Files:**
- Create: `apps/web/src/features/event/schemas.ts`
- Test: `apps/web/src/features/event/schemas.test.ts`

**Interfaces:**
- Produces: `eventFormSchema`、`EventFormValues`（`{ title, startAt, endAt, isAllDay, location?, note? }`，时间为 `YYYY-MM-DDTHH:mm` 字符串）。

- [ ] **Step 1: 写失败测试** — 对齐 `features/task/schemas.test.ts` 结构。用例：空标题失败、超长标题失败、end ≤ start 失败（`refine` 报错）、空 startAt/endAt 失败、合法值通过（含 optional 省略）。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**
```ts
import { z } from 'zod'

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(200, '标题过长'),
    startAt: z.string().min(1, '请选择开始时间'),
    endAt: z.string().min(1, '请选择结束时间'),
    isAllDay: z.boolean(),
    location: z.string().trim().max(200, '地点过长').optional(),
    note: z.string().trim().max(2000, '备注过长').optional(),
  })
  .refine((v) => !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt), {
    path: ['endAt'],
    message: '结束时间必须晚于开始时间',
  })

export type EventFormValues = z.infer<typeof eventFormSchema>
```
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/features/event/schemas.ts apps/web/src/features/event/schemas.test.ts && git commit -m "feat(web): event form schema"`

---

### Task 6: `features/event/queries.ts`

**Files:**
- Create: `apps/web/src/features/event/queries.ts`
- Test: `apps/web/src/features/event/queries.test.tsx`

**Interfaces:**
- Consumes: `listEvents/createEvent/updateEvent/deleteEvent`（Task 3）、`dayWindow/sortEvents`（Task 4）。
- Produces: `useEvents(date)`、`useCreateEvent()`、`useUpdateEvent()`、`useDeleteEvent()`。

- [ ] **Step 1: 写失败测试** — 对齐 `features/task/queries.test.tsx`（`vi.mock('./api')`、`renderHook` + wrapper、`mockedFn.mock.calls[0][0]` 断言首参）。用例：
  - `useEvents('2026-08-06')` → 调 `listEvents(dayWindow 的 from, to)` 一次，返回按 `startAt` 排序后的数组。
  - `useCreateEvent` mutate → `createEvent` 首参正确。
  - `useUpdateEvent` mutate `{ id, ...patch }` → `updateEvent(id, patch)`。
  - `useDeleteEvent` mutate → `deleteEvent(id)`。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现**
```ts
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
  type CreateEventInput,
  type EventEntry,
  type UpdateEventInput,
} from './api'
import { dayWindow, sortEvents } from './lib'

export function useEvents(date: string) {
  return useQuery({
    queryKey: ['events', date],
    queryFn: async () => {
      const { from, to } = dayWindow(date)
      const events = await listEvents(from, to)
      return events.sort(sortEvents)
    },
    staleTime: 30_000,
  })
}

export function useCreateEvent(): UseMutationResult<EventEntry, Error, CreateEventInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      toast.success('日程已创建')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error(error.message || '日程创建失败')
    },
  })
}

export function useUpdateEvent(): UseMutationResult<
  EventEntry,
  Error,
  { id: string } & UpdateEventInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }) => updateEvent(id, input),
    onSuccess: () => {
      toast.success('日程已更新')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error(error.message || '日程更新失败')
    },
  })
}

export function useDeleteEvent(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      toast.success('日程已删除')
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      toast.error(error.message || '日程删除失败')
    },
  })
}
```
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/features/event/queries.ts apps/web/src/features/event/queries.test.tsx && git commit -m "feat(web): event query hooks"`

---

### Task 7: `features/event/components/event-form-dialog.tsx`

**Files:**
- Create: `apps/web/src/features/event/components/event-form-dialog.tsx`
- Test: `apps/web/src/features/event/components/event-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `useEventUIStore`（Task 2）、`eventFormSchema`（Task 5）、`toLocalISO/toLocalInputValue`（Task 4）、`useCreateEvent/useUpdateEvent`（Task 6）、`components/ui/{dialog,input,label,textarea,checkbox,button}`。
- Produces: `<EventFormDialog />`（挂载在 event-page，`open`/`onOpenChange` 从 store 驱动）。

**行为：**
- 读取 store：`createOpen`、`editingEvent`、`viewedDate`、`close`。
- RHF + `zodResolver(eventFormSchema)`；打开时 `reset`：
  - 新建：`startAt = viewedDate + 'T09:00'`、`endAt = viewedDate + 'T10:00'`、`isAllDay: false`、title/location/note 空。
  - 编辑：`title`、`toLocalInputValue(startAt/endAt)`、`isAllDay`、`location ?? ''`、`note ?? ''`。
- 全天开关（`watch('isAllDay')`）：开 → 隐藏两个 `datetime-local`，显示一个 `<input type="date">`（值 = `watch('startAt').slice(0,10)`），onChange 同时 `setValue('startAt', `${d}T00:00`)`、`setValue('endAt', `${d}T23:59`)`。
- 提交：统一 `toLocalISO` 转换 startAt/endAt 后：
  - 新建 → `createEvent({ title, startAt, endAt, isAllDay, location: location || undefined, note: note || undefined })`。
  - 编辑 → `updateEvent(editingEvent.id, { title, startAt, endAt, isAllDay, location: location || '', note: note || '' })`（PUT 部分更新，传空串即清空，对齐后端语义）。
  - 成功后 `close()`（mutation 内部已 toast + invalidate）。
- 结构对齐 `task-group-dialog.tsx`：`DialogContent` + `DialogHeader`（标题「新建日程」/「编辑日程」）+ `<form>` + `DialogFooter`（取消/保存，`isPending` 时按钮「保存中…」）。

- [ ] **Step 1: 写失败测试** — 用 `renderWithProviders`（queries 需 QueryClient）+ mock `useEventUIStore`（`vi.mock('@/stores/event-ui')`）与 `./queries`（mock mutations）。用例：
  - 新建态：默认起止 = 查看日期 09:00–10:00；提交调 `createEvent`，参数含 `toLocalISO` 后的值。
  - 编辑态：预填标题与本地时间；提交调 `updateEvent(id, ...)`。
  - end ≤ start：显示「结束时间必须晚于开始时间」，不提交。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现组件**（见上「行为」，UI 参照 `task-group-dialog` / `diary-create-page` 的字段排版）。
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/features/event/components/event-form-dialog.tsx apps/web/src/features/event/components/event-form-dialog.test.tsx && git commit -m "feat(web): event create/edit form dialog"`

---

### Task 8: `features/event/components/event-item.tsx`

**Files:**
- Create: `apps/web/src/features/event/components/event-item.tsx`
- Test: `apps/web/src/features/event/components/event-item.test.tsx`

**Interfaces:**
- Consumes: `eventTimeLabel`（Task 4）、`useDeleteEvent`（Task 6）、`useEventUIStore.openEdit`（Task 2）、`components/ui/{dialog,dropdown-menu,button,badge}`。
- Produces: `<EventItem event={EventEntry} />`。

**结构（对齐 `moment-item.tsx`）：**
- 卡片：左列时间标签（`eventTimeLabel`，全天显示「全天」徽标样式）+ 标题（粗体）。
- 次行：`📍 {location}`（若有）；备注（若有，>150 字截断 + 展开/收起）。
- 右上 `⋯` DropdownMenu：**编辑**（`openEdit(event)`）/ **删除**（打开确认弹窗）。
- 删除确认弹窗（内联，对齐 moment-item）：`DialogTitle`「删除日程」+ 说明 + 取消/删除（`variant="destructive"`，调 `useDeleteEvent`）。

- [ ] **Step 1: 写失败测试** — `renderWithProviders` + mock `./queries`（useDeleteEvent）与 `@/stores/event-ui`（openEdit）。用例：
  - 时段事件：显示 `HH:mm – HH:mm` 与标题。
  - 全天事件：显示「全天」，不显示时间段。
  - 有地点：显示地点。
  - 点「编辑」→ 调 `openEdit(event)`。
  - 点「删除」→ 确认弹窗 → 确认后调 `deleteEvent(id)`。
- [ ] **Step 2: 跑测试确认失败。**
- [ ] **Step 3: 实现组件。**
- [ ] **Step 4: 跑测试确认通过。**
- [ ] **Step 5: Commit** — `git add apps/web/src/features/event/components/event-item.tsx apps/web/src/features/event/components/event-item.test.tsx && git commit -m "feat(web): event list item card"`

---

### Task 9: `event-nav` / `event-date-nav` / `event-list` / `event-page`

**Files:**
- Create: `apps/web/src/features/event/components/event-nav.tsx`
- Create: `apps/web/src/features/event/components/event-date-nav.tsx`
- Create: `apps/web/src/features/event/components/event-list.tsx`
- Create: `apps/web/src/features/event/pages/event-page.tsx`

**Interfaces:**
- `EventNav`：顶栏动态导航，标题「日程」+「新建日程」按钮 → `useEventUIStore().openCreate()`（对齐 `DiaryNav`）。
- `EventDateNav`：过滤表单。读 `useEventUIStore()` 的 `viewedDate`/`setViewedDate`。渲染 `<input type="date" value={viewedDate} onChange={...}>` + 「◀」/「今天」/「▶」按钮（前后各 ±1 天；「今天」→ `todayLocal()`）。本地加一天用 `new Date(y, m-1, d+1)` 再格式化，避免跨月/年 bug。
- `EventList`：`useEvents(useEventUIStore().viewedDate)`；loading（`Loader2`）/ error（重试，对齐 `DiaryTimeline`）/ 空态（「今天没有日程」，+ 📅 emoji，对齐 moment 空态）/ 列表（`EventItem`，行间 `border-b`，对齐 moment/diary）。
- `EventPage`：薄壳 —
```tsx
export default function EventPage() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-full max-w-[600px] flex-col gap-3 px-2">
        <EventDateNav />
        <EventList />
      </div>
      <EventFormDialog />
    </div>
  )
}
```

- [ ] **Step 1: 实现四个组件**（本任务无独立单测；行为经 Task 10 接线后由 App 级验证覆盖。`EventDateNav` 的 +1 天逻辑若抽纯函数则补测试）。
- [ ] **Step 2: 跑现有测试 + typecheck** — `cd apps/web && bun run test && bun run typecheck`。
- [ ] **Step 3: Commit** — `git add apps/web/src/features/event/components/event-nav.tsx apps/web/src/features/event/components/event-date-nav.tsx apps/web/src/features/event/components/event-list.tsx apps/web/src/features/event/pages/event-page.tsx && git commit -m "feat(web): event single-day page (date nav + list)"`

---

### Task 10: 接线 — `index.ts` + `router.tsx` + `app-sidebar.tsx`

**Files:**
- Modify: `apps/web/src/features/event/index.ts`（对齐 `features/task/index.ts`：导出 api 函数、类型、hooks、schemas、lib、`EventNav`）
- Modify: `apps/web/src/app/router.tsx` — 加
```tsx
{
  path: 'event',
  element: lazyPage(() => import('@/features/event/pages/event-page')),
  handle: { nav: <EventNav /> },
},
```
（import `EventNav` from `@/features/event/components/event-nav`，对齐既有 lazy 路由写法；放在 task 之后、`*` 之前）
- Modify: `apps/web/src/components/common/app-sidebar.tsx` — 在「日记」与「任务」之间插：
```tsx
<SidebarMenuItem>
  <NavLink to="/event" className="flex items-center gap-2">
    {({ isActive }) => (
      <SidebarMenuButton isActive={isActive}>
        <CalendarDays />
        <span className="text-lg">日程</span>
      </SidebarMenuButton>
    )}
  </NavLink>
</SidebarMenuItem>
```
（import `CalendarDays` from `lucide-react`）

- [ ] **Step 1: 改三个文件。**
- [ ] **Step 2: 验证** — `cd apps/web && bun run typecheck && bun run test && bun run lint && bun run build`。
- [ ] **Step 3: Commit** — `git add apps/web/src/features/event/index.ts apps/web/src/app/router.tsx apps/web/src/components/common/app-sidebar.tsx && git commit -m "feat(web): wire event route and sidebar"`

---

### Task 11: 补全 CLAUDE.md 路由表

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新模块树**（services/api → modules 列表）加 `task/` 与 `event/`。
- [ ] **Step 2: 更新 API 路由表**，在 moments 区块后补 task 与 event 行：
```
| GET, POST | `/api/task-groups` | 任务组列表 / 创建 |
| GET, PUT, DELETE | `/api/task-groups/:id` | 任务组详情 / 重命名 / 删除 |
| GET, POST | `/api/tasks` | 任务列表（`?groupId=&status=`）/ 创建 |
| GET, PUT, DELETE | `/api/tasks/:id` | 任务详情 / 更新（status 同步 completedAt）/ 删除 |
| GET, POST | `/api/events` | 事件列表（`?from=&to=` 时间窗口，裸数组）/ 创建 |
| GET, PUT, DELETE | `/api/events/:id` | 事件详情 / 部分更新 / 删除 |
```
（field-naming gotcha 段落同步加一句：event 字段为 `title`/`startAt`/`endAt`/`isAllDay`/`location`/`note`，列表返回裸数组）
- [ ] **Step 3: Commit** — `git add CLAUDE.md && git commit -m "docs: add event and task to module tree and route table"`

---

## 最终验证（全量）

- 根：`bun run typecheck`（api + mcp + web）；根 `bun run test`（MCP + Web）。
- `apps/web`：`bun run lint`（0 error）、`bun run build`。
- 手动冒烟（可选）：起 docker api + `vite dev`，建/编/删一个事件。
