# Flutter 移动端 Event（日程）模块设计文档

- 日期：2026-08-10
- 状态：🔶设计中（已获用户批准，待实施）
- 范围：apps/mobile（Flutter，iOS + Android）
- 前置记录：`.ai/requirements/2026-08-05-event-module.md`（后端 ✅已实施 + MCP/CLI ✅已实施）；`.ai/architecture/2026-08-06-web-event-feature-design.md`（Web 端已实施进生产，本次移动端照它对齐）；`.ai/architecture/2026-08-06-flutter-mobile-tech-stack.md`（移动端技术栈）
- 权威契约来源：`services/api/src/modules/event/event.types.ts`（后端；Web `apps/web/src/features/event/api.ts` 已按它对齐）

---

## 1. 背景与目标

Event（日历）模块后端与 Web 端均已上线生产。移动端侧栏已有「日历」占位（`/event` 路由 → `PlaceholderPage`，抽屉徽标写死 `'2'`），`event_api.dart` 仅实现 `countToday()`。本次将其替换为真实日程页，交互与 Web 端对齐：

- **主视图：单日列表**（默认今天，日期导航切换，过滤 = 所选日期）
- **日期跳转：自绘月历弹窗**（带日程圆点标记、可切月、点选即跳）
- 事件卡片：全天徽标 / 时段 / 跨日时间 + 标题 + 地点 + 备注（截断/展开）+ 编辑/删除
- 新建/编辑合一底部弹窗（全字段：标题/开始/结束/全天/地点/备注）
- 抽屉 `/event` 徽标接真实「今天事件数」（补掉写死的 `'2'`）

**不做**：周/月主视图（拍板单日）、事件重复（需求明确无重复）、提醒（API 无此字段）、推送通知、后端任何改动。

## 2. 已定决策（用户拍板）

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 主视图形态 | **单日列表对齐 Web**（不是月历/周视图时间格）——个人稀疏日程场景下最简单一致，且 Web 已验证交互 |
| 2 | 日期跳转交互 | **自绘月历弹窗**（bottom sheet，带日程圆点、可切月）——手机端「日历感」的自然落点；点日期文字触发 |
| 3 | 月历实现 | **手写 7 列网格**（约 150 行），不引 `table_calendar`——延续技术栈「不引组件库」原则，视觉完全贴 Material 3 |
| 4 | 更新提交 | PUT **全量提交**（title/startAt/endAt/isAllDay/location?/note?）——后端部分更新语义完全兼容，location 清空（空串）天然正确，比逐字段 diff 简单 |
| 5 | 抽屉徽标 | 接 `eventTodayCountProvider`（复用已有 `countToday`），替换写死的 `'2'` |

## 3. 页面设计

```
AppShell（AppBar 标题「日历」）
┌──────────────────────────────────┐
│  ◀   2026年8月12日 周三   今天  ▶  │  ← 日期导航栏（event_date_nav）
├──────────────────────────────────┤
│  09:00–10:00   产品评审  📍会议室  │  ← 事件卡片，按 startAt 升序
│  全天           出差深圳          │  ← 全天徽标
│                                  │
│       （空态）这天没有日程          │
│                                  │
│                            [＋]   │  ← FAB 新建日程（预填选中日）
└──────────────────────────────────┘
         │  点日期文字
         ▼
┌─ bottom sheet：自绘月历（month_calendar_sheet）─┐
│  ‹   2026年8月          [今天]              ›  │
│  一  二  三  四  五  六  日                     │
│   3   4   5   6   7   8   9                    │
│  10  11 ● 13  14  15  16  17   ← ● = 有日程    │
│  18  19  20  21  22  23  24   ← 今天=实心圆    │
│  25  26  27  28  29  30  31   ← 选中=描边       │
│                                  │
│       点选日期 → 关弹窗并跳到该日               │
└──────────────────────────────────┘
```

关键交互：

- **◀ ▶** 前后翻一天；**今天** 跳回今天（已在今天时置灰）。
- **点日期文字** → 弹月历；左右滑 / ‹ › 切月；相邻月的灰色日期可直接点（跨月跳转）。
- **FAB** 新建：预填当前选中日期（默认 09:00–10:00，对齐 Web），避免在别的日期视图建错日子。
- 卡片 **⋯**（PopupMenuButton）→ 编辑 / 删除；删除弹确认框（「确定删除『标题』吗？删除后不可恢复。」）。

## 4. 模块结构

```
apps/mobile/lib/features/event/
├── event_api.dart        # 扩展现有：listRange / create / update / delete，保留 countToday
├── event_models.dart     # EventEntry.fromJson（时间字段保持 String，同 task 风格）
├── event_time.dart       # 纯函数日期工具（无 IO，单测友好）
├── event_providers.dart  # day/month/count providers + actions
├── event_page.dart       # 主页面：日期导航 + 列表 + FAB
└── widgets/
    ├── event_date_nav.dart       # ◀ 日期 今天 ▶；点日期弹月历
    ├── month_calendar_sheet.dart # 自绘月历弹窗（圆点/今天/选中/切月）
    ├── event_tile.dart           # 事件卡片 + ⋯ 菜单 + 删除确认
    └── event_edit_sheet.dart     # 新建/编辑合一底部弹窗
```

路由：`router.dart` 的 `/event` 由 `PlaceholderPage` 换成 `EventPage`（仍在 AppShell 内，侧栏「日历」入口不动）。
AppShell：`/event` 徽标改读 `eventTodayCountProvider`（与 `/task` 徽标同模式）。

## 5. API 契约与日期语义（关键）

### 5.1 API 封装

```
GET    /api/events?from=<ISO>&to=<ISO>   → EventEntry[]   // 裸数组！非 {items,total}
POST   /api/events                       → { title, startAt, endAt, isAllDay?, location?, note? }
GET    /api/events/:id                   → EventEntry
PUT    /api/events/:id                   → 部分更新（本次客户端全量提交，见决策 4）
DELETE /api/events/:id                   → 204
```

- 列表经 `getData` 返回裸 `List<dynamic>`，**不要**套 `unwrapItems`（那是 `{items,total}` 用的）。
- `location`/`note` 传空串 = 清空；不传 = 保持。

### 5.2 时区语义（Web 已验证，Dart 有反直觉点）

- **窗口是本地时区的 `[day 00:00, day+1 00:00)`**（月窗口同理 `[1号00:00, 下月1号00:00)`），序列化为**带本地偏移的 ISO**（复用现有 `_withOffset`，挪到 `event_time.dart`）。
- **Dart `DateTime.parse(带偏移 ISO)` 返回 UTC 时间（`isUtc=true`，已实测：`2026-08-05T10:00:00+08:00` → `2026-08-05 02:00:00Z`）** → 展示前一律 `.toLocal()`。这是本模块最容易踩的坑，写单测锁住。
- 全天事件存 `start=00:00`、`end=23:59:59`（对齐 Web），显示只出日期 + 「全天」徽标。
- 跨日事件：月历圆点在每个重叠日期都出现；单日列表标签 `M月d日 HH:mm – M月d日 HH:mm`（同日则 `HH:mm – HH:mm`）。

## 6. 数据流与状态管理

### 6.1 Provider（Riverpod 3，对齐 Web per-date 查询）

| Provider | 形态 | 用途 |
|----------|------|------|
| `eventsForDayProvider` | `FutureProvider.family<List<EventEntry>, 'YYYY-MM-DD'>` | 主列表：查 `[当日00:00, 次日00:00)` 窗口 |
| `eventsInMonthProvider` | `FutureProvider.family<List<EventEntry>, 'YYYY-MM'>` | 月历弹窗圆点：查整月窗口 |
| `eventTodayCountProvider` | `FutureProvider<int>` | 抽屉徽标（复用 `countToday`） |
| `eventActionsProvider` | `Provider<EventActions>` | create/update/delete |

- day family 按日期缓存，翻日切换零重查；日窗查询比「月结果内过滤」更正确（跨月事件按重叠语义也能命中）。
- **Mutation 成功后整体失效**：`invalidate(eventsForDayProvider)` + `invalidate(eventsInMonthProvider)` + `invalidate(eventTodayCountProvider)`——对齐 Web `invalidateQueries(['events'])` 整体失效；个人稀疏数据量下可接受。

### 6.2 纯函数（`event_time.dart`，全部单测）

| 函数 | 行为 |
|------|------|
| `dayKey(DateTime)` / `monthKey(DateTime)` | `YYYY-MM-DD` / `YYYY-MM`（本地） |
| `withOffset(DateTime)` → ISO | 本地时间 → 带 `±hh:mm` 偏移的 ISO（后端 `offset:true` 要求） |
| `dayWindow(dayKey)` / `monthWindow(monthKey)` | → `(from, to)` ISO 字符串对，闭开区间 |
| `eventTimeLabel(EventEntry)` | 全天 → `'全天'`；同日 → `HH:mm – HH:mm`；跨日 → `M月d日 HH:mm – M月d日 HH:mm` |
| `sortEvents(list)` | 按 startAt 升序（后端已排序，前端兜底） |
| `eventDayKeysInMonth(events, monthKey)` | 月内每天是否有日程的 `Set<String>`（圆点标记用） |
| `dateLabel(dayKey)` | `8月12日 周三`（导航栏标题） |

> 展示用时间一律 `DateTime.parse(iso).toLocal()` 后再格式化。

## 7. UI 组件明细

| 组件 | 说明 |
|------|------|
| `EventPage` | `ConsumerStatefulWidget`，持 `_selectedDay`；`Column(日期导航 + Expanded(列表))` + FAB。列表 `AsyncValue.when`（loading/error+重试/空态/数据），对齐 `MomentListPage` |
| `EventDateNav` | 左 ◀ / 中日期（InkWell 弹月历）/ 右 ▶ / 右侧「今天」按钮（今天时置灰） |
| `MonthCalendarSheet` | `showModalBottomSheet` 固定高度；周一开头；‹ › 切月 + 横向滑动切月；格子状态：普通 / 今天（实心）/ 选中（描边）/ 有日程（圆点）；相邻月灰色数字可点 |
| `EventTile` | 左时间列（全天徽标 or 时段），右标题 + 📍地点 + 备注（>150 字截断/展开）；trailing `PopupMenuButton`(⋯) → 编辑 / 删除（AlertDialog 确认） |
| `EventEditSheet` | `showModalBottomSheet(isScrollControlled: true)` + `viewInsets` 防键盘遮挡（对齐 task sheet）；标题*（≤200）/ 全天 Switch（开则隐藏时分、只显示日期）/ 开始、结束（`showDatePicker` + `showTimePicker`）/ 地点（≤200）/ 备注（多行 ≤2000）/ 创建·保存 FilledButton |
| `EventActions` | create / update / delete + 成功后整体 invalidate |

编辑弹窗规则：

- 新建预填：标题空、选中日 09:00–10:00（全天则 00:00–23:59:59）、地点/备注空。
- 编辑回填：`DateTime.parse(iso).toLocal()` → 预填。
- 提交校验：标题 trim 非空（SnackBar「请输入日程标题」）、`end > start`（SnackBar「结束时间必须晚于开始时间」）。
- 提交序列化：本地 DateTime → `withOffset` → ISO；全天 `00:00` / `23:59:59`。
- 提交中禁用按钮（`_submitting`，对齐 task sheet）。

## 8. 测试策略

门禁：`flutter analyze` + `flutter test`（延续技术栈约定）。

| 层 | 覆盖 |
|----|------|
| 单元测试 | `event_time_test.dart`：`withOffset`（+08:00 本地）、`dayWindow`/`monthWindow` 边界（含跨月/月末）、`eventTimeLabel` 三态（全天/同日/跨日）、`sortEvents`、`eventDayKeysInMonth`（单日/跨日/月末）、`dayKey`/`monthKey` 往返 |
| API 测试 | `event_api_test.dart`（mock Dio，对齐 `moment_api_test.dart`）：列表**裸数组**解码、create/update payload 形状、countToday 已有 |
| Widget 测试 | `event_page_test.dart`（导航/列表/空态/FAB/点日期弹月历）、`event_edit_sheet_test.dart`（全天切换隐藏时分、end≤start 拦截、编辑回填、新建提交）、`month_calendar_sheet_test.dart`（网格渲染/圆点/今天/选中/切月/选日回调）、`event_tile_test.dart`（全天徽标、时段、跨日、⋯菜单、删除确认） |
| 接线测试 | 更新 `router_test.dart`（`/event` → EventPage，补 provider overrides）、`app_shell_test.dart`（event 徽标加 `eventTodayCountProvider` override） |

测试辅助：`ProviderScope(overrides:)` 注入 mock provider / mock ApiClient（`apiClientProvider.overrideWith`），对齐现有 `router_test.dart` / `moment_api_test.dart` 模式。

## 9. 实施顺序

单流（仅 apps/mobile + 文档，**无后端改动 → 无子代理，可交给 flutter-agent**）：

1. `event_models.dart` + `event_time.dart`（含单测）
2. `event_api.dart` 扩展（listRange/create/update/delete，含 API 测试）
3. `event_providers.dart`（day/month/count providers + actions）
4. `widgets/`：`event_tile.dart` → `event_edit_sheet.dart` → `month_calendar_sheet.dart` → `event_date_nav.dart`（含各 widget 测试）
5. `event_page.dart` + 页面测试
6. 接线：`router.dart` / `app_shell.dart`（徽标）/ 更新 `router_test.dart` / `app_shell_test.dart`
7. 全量验证：`flutter analyze` + 全量 `flutter test`

## 10. 不做 / 已延期（明确排除，防回潮）

- 周/月视图作为主视图（拍板单日；月历仅作跳转弹窗）。
- 事件重复（recurring）：需求明确「无重复」。
- 事件提醒（reminder）：API 无此字段。
- 欢迎页入口卡片：任务模块也未加，保持一致。
- 事件附件：后端 Event 无附件能力。
