# 2026-08-09 — Flutter task module Task 10: due-date views + edit sheet

## 做了什么

按 SDD plan `docs/superpowers/plans/2026-08-09-task-module-mobile.md` 的 Task 10 实现（commit `68a4f12`）：

- `task_due_list_view.dart`：把 Task 9 的占位 widget 替换为真正的 `TaskDueListView`（`TaskDueKind.today/week/month` 枚举保留，TaskPage 引用它）。今日 tab 拆「已过期 / 今天」两段（overdue 项 `showOverdue: true` 走红色徽标）；周/月单列表。tap → `showTaskEditSheet(task: t)`，toggle → `taskActionsProvider.toggleDone`。
- `task_edit_sheet.dart`：真正的创建/编辑底部弹窗（标题 200 上限、组下拉、截止日期 ListTile + DatePicker + 清除按钮、仅编辑时显示状态下拉、创建/保存 FilledButton、空标题 SnackBar 拦截、`clearDueDate: _dueDate == null && task.dueDate != null`）。Task 9 的 `showGroupNameDialog` 原样保留（组列表重命名在用）。
- `task_providers.dart`：新增 `groupTitleProvider`（groupId → 组名，FutureProvider.family，找不到回退 ''）。
- `task_page.dart`：tab-0 FAB 从「打开任务编辑器」改为「showGroupNameDialog → createGroup」。
- `task_group_list_view.dart`：无需改动——Task 9 已实现长按重命名/删除流，与 brief Step 3 一致，仅验证编译。

## 验证

`flutter analyze` 无 issue；`flutter test` 137 个全部通过。

## 坑（下一会话注意）

1. **Dart 没有 String `<` 运算符**：日期字符串比较必须 `a.compareTo(b) < 0` / `>= 0`。brief 代码里 `t.dueDate! < todayStr()` 是错的，已改为 compareTo（TaskTile 在 Task 9 已同样处理）。
2. **State 类里用 `mounted` 而不是 `context.mounted`**：`use_build_context_synchronously` lint 对 State.context 的守卫偏好 `if (!mounted) return;`（catch 分支里更严格）。moment 模块也统一用 `mounted`。
3. **DropdownButtonFormField 用 `initialValue:`**（Flutter 3.44 / Dart 3.12 已弃用 `value:`）；`firstOrNull` 是 dart:core 自带（Dart 3+），无需 package:collection。
4. 编辑弹窗里「未选择任务组」抛 `Exception` 会被 `humanizeError` 吞成「操作失败，请稍后重试」——按 brief 原样实现（YAGNI），若之后要做空组兜底可改直接 SnackBar。
