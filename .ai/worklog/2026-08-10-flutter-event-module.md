# 2026-08-10 — Flutter 移动端 Event（日程）模块实施

后端 + Web 端 Event 模块已进生产，本次完成移动端：单日列表对齐 Web + 自绘月历弹窗跳转 + 新建/编辑/删除。设计文档 `.ai/architecture/2026-08-10-flutter-event-module-design.md`；实施计划已归档 `.ai/archive/2026-08-10-flutter-event-module-plan.md`。

## 改动（分支 feat/mobile-event，SDD 8 任务，commit 44bcf40..2930891）

- `features/event/`（新模块，平铺结构）：
  - `event_models.dart`：EventEntry（时间保持 ISO 字符串）
  - `event_time.dart`：纯日期函数（dayKey/monthKey/dayWindow/monthWindow/withOffset/eventTimeLabel/sortEvents/eventDayKeysInMonth 等）
  - `event_api.dart`：CRUD（裸数组列表、create/update 全字段、location/note 空串清空）
  - `event_providers.dart`：eventsForDayProvider / eventsInMonthProvider（family）+ eventTodayCountProvider + EventActions（写后整体失效）
  - `event_page.dart` + widgets/（event_date_nav / month_calendar_sheet / event_tile / event_edit_sheet）
- 接线：`router.dart` `/event` → EventPage；`app_shell.dart` 抽屉 `/event` 徽标接真实今天事件数（替换写死的 '2'）
- **顺带修掉的潜在 bug**：`ApiClient._guard` 对 204 空 body 抛 BAD_RESPONSE（`unwrapResponse` 对非 Map body 抛错）——moment/task/blob/event 所有 `deleteData` 都受影响，只是没暴露。加 `if (res.statusCode == 204) return null;` 修复。

## 验证

- `flutter analyze` No issues found + `flutter test` 全量 234/234（跑两次稳定）。

## 坑 / 对下一次会话的提示

- **Dart `DateTime.parse(带偏移ISO)` 返回 UTC**（已实测 `2026-08-05T10:00:00+08:00` → `2026-08-05 02:00:00Z`）：展示/日期计算前必须 `.toLocal()`。eventTimeLabel/eventDayKeysInMonth/编辑回填都遵守了。
- **Riverpod 3.4.2 无 `valueOrNull`**：用 `.value`（error 状态返回 null 不抛——v2 语义才是抛）。实证过。
- **Riverpod 3.4.2 `ref.invalidate(裸 family)` 会让已实例化的 family 成员失效**（provider 测试实证 listByDayCalls 1→2）。
- plan 测试代码有 6 处 bug 被 implementer 修掉（写这里供下次写 plan 参考）：family override 用固定列表导致切日断言无效（要按 day 参数派生）；Builder 放 MaterialApp 外导致 "No MaterialLocalizations found"；800×600 测试视口放不下 6 行月历（要 400×800 手机视口）；router_test 需补 eventTodayCountProvider override（否则 `!timersPending`）；`_pickDateTime` 两次 await 之间要 `mounted` 守卫；月历 `find.text('1')` 可能匹配相邻月两次（用 findsNWidgets 或唯一日）。
- 月跳转页面测试有**日期脆弱性**（day-aware override 下用固定 `dayEvent('2026-08-15')`；今天离开 2026-08 后会挂，需改成从当前月派生目标日 `'${todayKey().substring(0, 7)}-15'`）。

## 真机手测清单

- [ ] 新建/编辑/删除日程（含全天切换、跨日事件圆点与标签）
- [ ] 月历弹窗：圆点标记、切月（‹›/横滑）、相邻月灰点直跳、今天
- [ ] 抽屉 /event 徽标 = 今天事件数
- [ ] 下拉刷新、网络错误重试

## 真机反馈改造（同日稍后，commit 406ddf3..ab7d003，已合并 main 24d2e72 并推送）

真机实测 Event 模块后按反馈改造（设计文档的「编辑=底部弹窗」已过时，以本段为准）：

1. **顶部导航栏**：◀ 日期 今天 ▶ 移入 AppBar 标题区（去掉「日历」标题名）；新建按钮移入 AppBar 右上角 actions（右下 FAB 删除）。选中日期状态提升为 `eventSelectedDayProvider`（`NotifierProvider<String>`，AppShell 与 EventPage 共享）——这是 AppBar 与列表页共享状态的关键。
2. **编辑页**：新建/编辑从 `showModalBottomSheet` 改为独立全屏页 `/event/edit`（`EventEditPage` + `EventEditArgs{day?, event?}`，go_router `extra` 传参，ShellRoute 外同 `/moments/create` 模式）。表单逻辑整体迁移不变。
3. **布局修正**：时间标签 `maxLines:1 + ellipsis` 保持一行（去掉 `height:1.3` 行高覆盖修复与标题首行对齐）；月历圆点与日期圆之间留间距（SizedBox 4→10）。

验证：`flutter analyze` No issues + `flutter test` 234/234。真机已重装验证。
