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
