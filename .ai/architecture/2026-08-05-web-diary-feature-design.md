# Web 前端 — 主题切换 + 日记模块 + diary by-date 端点设计（2026-08-05）

状态: **已确认，待实施**
适用范围: `apps/web`（浏览器端）+ `services/api`（by-date 端点）+ `services/mcp` + `apps/cli`（按日期查日记）
前置: 技术栈与目录见 [[2026-08-05-web-frontend-tech-stack]] / [[2026-08-05-web-frontend-architecture]] / [[2026-08-05-web-moment-feature-design]]。日记后端契约见 `services/api/src/modules/diary/*`。
设计参考: 旧项目 `serenique-test/apps/web`（无日记模块，仅做整体风格参考）；Moment 模块的列表/新建页布局与动态导航模式。

---

## 1. 已确认决策（用户拍板）

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 主题切换位置 | **侧边栏底部**（`SidebarFooter` + `DropdownMenu`：浅色 / 深色 / 跟随系统）。覆盖 moment 设计决策⑦「不做主题切换」 |
| ② | 日记浏览形态 | **今天优先 + 时间线**：顶部「今天」卡片（有→查看/编辑，无→写今天）+ 下方全部日记倒序时间线 |
| ③ | 后端端点 | **加 `GET /api/diaries/by-date/:date`**（无则 404），**API / MCP / CLI 三层同步**（用户已确认用子代理并行完成） |
| ④ | 日记内容形态 | **纯文本**（`content`）。`2026-08-05-diary-content-forms.md` 明确暂缓图片/视频穿插，本次不接 blob |
| ⑤ | 时间线排序 | 客户端全量拉取（pageSize 50 循环）后按 `diaryDate` 降序。**不加** `order` 查询参数（避免后端级联扩散）；个人日记数据量有界，可接受 |
| ⑥ | 前端日期口径 | 前端「今天」与「未来日期校验」用 **UTC**（`new Date().toISOString().slice(0,10)`），与后端 `diary.domain.ts` 的 `todayStr()` 一致，避免时区导致「今天」被判为未来日 |

---

## 2. 主题切换（`apps/web`）

### 2.1 `components/common/theme-toggle.tsx`（新建）

- 用 `useTheme`（next-themes，已装已接线）。
- `DropdownMenu`：trigger 直接传 `className`（base-nova 不支持 `asChild`，见 moment 坑 ⑥）——样式对齐侧边栏菜单行（`flex w-full items-center gap-2 rounded-md px-2 py-1.5`）。
- 图标用 **CSS `dark:` 变体**切换 Sun/Moon（`relative` 容器 + `dark:scale-0` / `dark:rotate-90`），**不用 state/effect**（规避 `react-hooks/set-state-in-effect`，见 moment 坑 ⑦）。
- 三项：`浅色`（setTheme('light')）/ `深色`（setTheme('dark')）/ `跟随系统`（setTheme('system')）。
- 折叠态：用 `useSidebar()` 的折叠状态条件隐藏「主题」文字，只留图标。

### 2.2 `components/common/app-sidebar.tsx`（修改）

- `SidebarContent` 导航区追加「日记」项（lucide `BookOpen` 图标），置于「闪念」下方。
- 新增 `SidebarFooter`：`SidebarMenu` + 单 `SidebarMenuItem` 包裹 `<ThemeToggle/>`。

---

## 3. 后端 by-date 端点（`services/api`）

### 3.1 契约

```
GET /api/diaries/by-date/:date
  :date 必须匹配 /^\d{4}-\d{2}-\d{2}$/（非法 → 400 VALIDATION）
  命中 → 200 { success, data: DiaryEntry }
  未命中 → 404 NOT_FOUND「日记不存在」
```

> **路由顺序**：`/diaries/by-date/:date` 必须注册在 `/diaries/:id` **之前**，避免 `by-date` 被当作 `:id`。

### 3.2 改动文件（模块骨架对齐）

| 文件 | 改动 |
|------|------|
| `diary.types.ts` | 加 `GetDiaryByDateSchema = z.object({ date: z.string().regex(dateRegex) })`、`GetDiaryByDateInput = { diaryDate: string }` |
| `diary.service.ts` | 加 `getByDate(input)`：`select().where(eq(diaries.diaryDate, input.diaryDate))`，无行抛 `NOT_FOUND` 404「日记不存在」，返回 `toDiaryEntry(row)` |
| `diary.handler.ts` | 加 `getByDate`：`GetDiaryByDateSchema.parse({ date: c.req.param("date") })` → `diaryService.getByDate({ diaryDate: date })` → `Res.ok` |
| `diary.router.ts` | `.get("/diaries/by-date/:date", ...)` 注册在 `:id` 之前 |
| `exports.ts` | 导出 `GetDiaryByDateSchema` 与 `GetDiaryByDateInput` 类型 |
| `diary.service.test.ts` | 加 schema 单测（合法/非法日期） |
| `diary.service.integration.test.ts` | 加 getByDate 命中/404 用例（沿用 2020 固定日期，避开真实数据） |

---

## 4. MCP by-date 工具（`services/mcp`）

### 4.1 `src/tools/diary.tools.ts`（修改）

新增工具，跟随现有 `diary.tools.ts` 模式：

```
registerTool("get_diary_by_date", {
  title: "Get Diary By Date",
  description: "根据日期 (YYYY-MM-DD) 获取单篇日记，无则报错。",
  inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("日期 YYYY-MM-DD") }),
}, async (input) => runTool(() => diaryService.getByDate({ diaryDate: input.date })))
```

`diaryService.getByDate` 来自 `@serenique/api`（需后端 3.2 先落地）。未命中时 `runTool` 把 404 转成对 AI 的报错信息（与现有 `get_diary` 行为一致）。

### 4.2 测试

跟随 `services/mcp` 现有工具测试模式（若存在工具级测试则补；否则保持 `bun test` 全绿即可）。MCP 服务导入的是 `@serenique/api`，本地 `bun install` 后 workspace 包直接可用。

---

## 5. CLI by-date（`apps/cli`）

### 5.1 `cmd/diary.go`（修改）

扩展 `diary get` 支持 `--date`：

```
serenique diary get --date 2026-08-05    # 走 GET /api/diaries/by-date/2026-08-05
serenique diary get <id>                 # 原有按 ID 行为不变
```

- 加 `diaryGetDate` flag；`Args` 由 `cobra.ExactArgs(1)` 改为 `cobra.MaximumNArgs(1)`。
- `RunE` 逻辑：`--date` 提供时用 by-date 路径（`/api/diaries/by-date/<date>`）；否则要求位置参数 id（缺省报错）。
- 沿用 CLI 硬契约：错误 `RunE` 返回 error、stdout 纯净（结果走 `printer`）、`--json` 时也是单文档。
- 更新 `Long` 帮助文案，加示例。

### 5.2 测试

`cmd/` 下现有测试模式（`commands_test.go` 等）。加用例：`--date` 构造正确路径、无 id 且无 --date 报错。CLI 测试走 HTTP mock / client 单测，不依赖真实后端。

---

## 6. Web 日记 feature（`apps/web`）

### 6.1 文件清单

```
features/diary/
├── api.ts          # DiaryEntry + listDiaries / getDiaryByDate / createDiary / updateDiary / deleteDiary
├── queries.ts      # useDiaries（全量+倒序）/ useDiaryByDate / useCreateDiary / useUpdateDiary / useDeleteDiary
├── schemas.ts      # diaryFormSchema（content 必填 + diaryDate YYYY-MM-DD + 非未来日，UTC）
├── components/
│   ├── diary-nav.tsx            # 列表页动态导航：标题「日记」+ 新建按钮 → /diary/write
│   ├── diary-create-nav.tsx     # 新建页动态导航：返回 + 标题
│   ├── diary-today-card.tsx     # 今天卡片（useDiaryByDate(今天)）
│   ├── diary-item.tsx           # 单篇：日期 + 内容截断 + 编辑/删除
│   └── diary-timeline.tsx       # 倒序时间线 + 空/错态
├── pages/
│   ├── diary-list-page.tsx      # 今天卡片 + 时间线（居中 max-w-[600px]，对齐 moment）
│   └── diary-create-page.tsx    # 新建/编辑合一（?date= 驱动）
└── index.ts        # barrel：暴露 pages + 必要 hooks
```

### 6.2 API 契约（手动定义，对齐后端）

```
GET    /api/diaries?page=&pageSize=      → { items: DiaryEntry[], total }   // 现有
GET    /api/diaries/by-date/:date        → DiaryEntry | 404                 // 新端点
POST   /api/diaries                      → { content, diaryDate? }          // 现有，409 冲突
PUT    /api/diaries/:id                  → { content }                      // 现有
DELETE /api/diaries/:id                  → 204                              // 现有
```

- `DiaryEntry = { id, diaryDate, content, createdAt, updatedAt }`。
- `getDiaryByDate(date)`：`unwrap` 抛 `ApiError` 时，`status === 404` → 返回 `null`，其余 rethrow（今天卡片「无今天」态靠这个区分）。
- `deleteDiary`：204 守卫（对齐 `deleteMoment`）。

### 6.3 queries

- `useDiaries()`：`useQuery(['diaries'])`，queryFn 循环 page（pageSize 50）拉全量，按 `diaryDate` 降序返回 `DiaryEntry[]`。`staleTime` 适当（如 30s）。
- `useDiaryByDate(date)`：`useQuery(['diary','by-date',date])`，`enabled: !!date`。
- 三个 mutation（create / update / delete）：成功后 `invalidateQueries(['diaries'])` 与 `['diary','by-date']`；create/delete 带 sonner toast（对齐 moment `useCreateMomentWithMedia` 的 toast 模式）。

### 6.4 schemas（RHF + zod）

```
diaryFormSchema = z.object({
  content: z.string().trim().min(1, '内容不能为空'),
  diaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
}).refine((v) => v.diaryDate <= todayUTC(), { path: ['diaryDate'], message: '不能创建未来日期的日记' })
```

`todayUTC()` 放 `lib/date.ts`（`new Date().toISOString().slice(0,10)`）。注意：`content` 后端 `min(1)` 是空串拦截，前端用 trim 后再 min(1)。

### 6.5 页面与流程

**列表页 `/diary`**（handle.nav = `<DiaryNav/>`）：
- 「今天」卡片：loading（skeleton）→ 有今天 → 显示内容（截断）+「编辑」（→ `/diary/write?date=<今天>`）；无今天 → CTA「写今天的日记」（→ `/diary/write`）。
- 下方 `DiaryTimeline`：倒序条目，行内含日期 + 内容预览 + 编辑/删除（删除走确认对话框，对齐 moment）。

**新建/编辑页 `/diary/write`**（handle.nav = `<DiaryCreateNav/>`）：
- `useSearchParams` 读 `?date=`，缺省今天（UTC）。
- `useDiaryByDate(date)`：有 → 编辑态（表单预填，PUT，按钮「保存修改」）；无 → 新建态（空表单，POST，按钮「保存」）。
- 表单：`<input type="date" max={todayUTC()}>`（原生控件，不加 shadcn calendar 依赖）+ 自动增高 textarea（对齐 moment 新建页写法）。
- 提交成功：toast + `navigate('/diary')`。取消/返回：`navigate('/diary')`。

**路由**（`app/router.tsx`）：追加 `/diary`、`/diary/write` 两条 lazy 路由 + handle.nav。

**欢迎页**（`app/pages/welcome-page.tsx`）：追加「日记」入口卡片（`BookOpen` 图标 → `/diary`）。

**侧边栏**：见 §2.2。

### 6.6 测试

- `schemas.test.ts`：空内容、非法日期、未来日（注入今天）。
- `queries.test.tsx`：`useDiaryByDate` 404→null、`useDiaries` 全量倒序。
- `diary-today-card.test.tsx`：有今天 / 无今天两态。
- `diary-create-page.test.tsx`：新建提交（POST）、编辑预填（PUT）、未来日期拦截。
- `theme-toggle.test.tsx`：mock `next-themes` 的 `useTheme`，点击项调用 `setTheme`。
- 遵循 web 测试约定：`bun run test`（vitest）、mock `@/api/client`、`renderWithProviders`、显式 `afterEach(cleanup)`（setup 已配）。

---

## 7. 实施顺序（子代理并行分配）

| 流 | 范围 | 依赖 | 验证 |
|----|------|------|------|
| A. 后端 by-date | `services/api/src/modules/diary/*` + `exports.ts` + 测试 | 无 | `cd services/api && bun run typecheck && bun test`（集成测试可选） |
| B. Web（主题切换 + 日记） | `apps/web/src/**` | 无（契约先行，类型手动定义） | `cd apps/web && bun run typecheck && bun run test && bun run lint` |
| C. CLI by-date | `apps/cli/cmd/diary.go` + 测试 | 无（HTTP 契约） | `cd apps/cli && go build ./... && go vet ./... && go test -count=1 ./...` |
| D. MCP by-date | `services/mcp/src/tools/diary.tools.ts` + 测试 | A 先落地（import `diaryService.getByDate`） | 根 `bun test` |

A / B / C 并行启动；A 完成后启动 D。子代理**不提交 git**，由主会话统一 review + 提交。最后全量验证：根 `bun run typecheck`、根 `bun test`、`apps/web` build、CLI `make test`。

## 8. 待确认 / 已延期（明确不做，防止回潮）

- 日记内容形态（图片/视频穿插）：等 `diary-content-forms` 需求启动。
- 后端 `list` 加 `order` 参数：本次不做（客户端全量倒序兜底）。
- 移动端日记视图精细化、日历视图：后续按需。
- i18n、主题切换按钮的键盘/无障碍精细化打磨：本次从简。
