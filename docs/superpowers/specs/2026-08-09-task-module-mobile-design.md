# Task 模块移动端 + dueDate 扩展设计

- 日期：2026-08-09
- 状态：🔶设计中（已获用户批准，等待写入实现计划）
- 范围：`services/api`（dueDate + 日期范围查询）、`services/mcp`（工具参数）、`apps/cli`（flag/字段同步）、`apps/mobile`（任务模块页面 + 底部 tabbar）

---

## 1. 背景与目标

Serenique 移动端（Flutter）目前任务模块只有计数接口（`TaskApi.countUncompleted`），路由 `/task` 是占位页。本次为移动端实现完整任务模块，并确认一个架构问题：**不同模块页面可以有各自独立的底部 tabbar**（外层 `AppShell` 提供 AppBar + 抽屉，模块页可嵌套自己的 Scaffold 添加 `bottomNavigationBar`）。

任务模块采用「抽屉侧栏 + 模块内底部悬浮 tabbar」的组合：

- **Tab 1 任务组**：显示所有任务组；点进某个任务组后显示该组下所有任务
- **Tab 2 今日**：今天到期 + 已过期（分组）的未完成任务
- **Tab 3 本周**：本周（周一~周日）到期的未完成任务
- **Tab 4 本月**：本月到期的未完成任务

关键发现：现有 Task 数据模型**没有任何日期字段**（只有 `title / groupId / status / createdAt / updatedAt / completedAt`）。「今日/本周/本月」视图需要一个每任务日期，因此给任务增加 **dueDate（截止日期）** 字段——这需要 API 加列 + 迁移 + 查询参数，CLI / MCP 同步。

## 2. 需求决策（已与用户确认）

| 问题 | 决策 |
|------|------|
| 日期来源 | 给任务加 **dueDate** 截止日期字段（后端扩展） |
| 日期粒度 | **纯日期** `YYYY-MM-DD`，不带时间；本地时区语义 |
| 本周定义 | **周一 ~ 周日** |
| 日期视图内任务状态 | **只显示未完成**（status=todo）；点完成即从视图消失 |
| 过期任务 | 今日 tab 顶部「已过期」分组（dueDate < 今天 且未完成）；本周/本月不含过期任务（严格范围，避免重复） |
| 交互范围 | **完整 CRUD**：任务组新建/改名/删除；任务新建（可设截止日期）/完成/编辑/删除 |
| 无 dueDate 的任务 | 只出现在任务组视图，不出现在任何日期视图 |

## 3. 方案选择

| 方案 | 做法 | 结论 |
|------|------|------|
| A. 后端日期查询 | API 列表接口支持 `dueDateFrom`/`dueDateTo`/`status`/`groupId` 组合过滤，三个日期视图共用同一接口传不同参数 | ✅ 采用。与 event 模块 from/to 时间窗模式一致；分页正确（客户端跨页过滤会漏数据）；CLI/MCP 复用 |
| B. 客户端过滤 | API 只加字段，客户端拉全量本地过滤 | 🪦 否决。列表分页（page/pageSize），跨页过滤必然漏任务 |
| C. 三个专用端点 | today/week/month 各一个端点 | 🪦 否决。冗余，与 A 等价但增加接口面 |

## 4. 后端设计（services/api）

### 4.1 schema（task.schema.ts）

- `tasks` 表新增列：`dueDate: date("due_date")`（**可空**）
- 新索引：`idx_tasks_due_date_status` on `(dueDate, status)`（日期视图查询：范围 + todo 过滤）
- Drizzle migration（生产走迁移文件，开发可 `db:push`）

### 4.2 types（task.types.ts）

- `CreateTaskSchema`：增加可选 `dueDate`（`z.string().regex(YYYY-MM-DD)` 或直接校验格式；空字符串视为 null）
- `UpdateTaskSchema`：增加可选 `dueDate`（允许显式清空）
- `TaskEntry`：增加 `dueDate: string | null`
- `ListTaskSchema`：增加可选 `dueDateFrom` / `dueDateTo`（`YYYY-MM-DD` 字符串，`z.coerce` 不需要——直接字符串校验后转 Date）

### 4.3 service（task.service.ts）

- `listTasks`：当提供 `dueDateFrom`/`dueDateTo` 时用 `between(like)` 过滤；注意 `dueDate` 是 date 列（无时区），过滤用日期边界比较
- 排序：日期视图按 `dueDate ASC, createdAt DESC`；无日期过滤时保持现有 `createdAt DESC`
- `createTask` / `updateTask`：写入 dueDate（date 字符串 → Date 对象）

### 4.4 日期视图的查询映射（移动端调用约定）

| 视图 | 请求参数 |
|------|---------|
| 今日（含过期） | `status=todo&dueDateTo=<今天>`；前端按 dueDate < 今天 / = 今天 分组 |
| 本周 | `status=todo&dueDateFrom=<本周一>&dueDateTo=<本周日>` |
| 本月 | `status=todo&dueDateFrom=<月初>&dueDateTo=<月末>` |

（服务端不做「今天/本周」等相对日期的魔法语义，全部由客户端算具体日期范围传入——保持接口无时区歧义、纯函数可测。）

## 5. CLI / MCP 同步

- **CLI**（apps/cli）：
  - `task create` / `task update`：新增 `--due-date` flag（格式 `YYYY-MM-DD`；update 时传空串清空？——设计为 `--due-date ""` 清空）
  - `task list`：新增 `--due-from` / `--due-to` flag
  - `internal/client/task.go`：`TaskEntry` 加 `DueDate *string` json tag `dueDate`；`CreateTaskInput`/`UpdateTaskInput` 加对应字段
  - 表格输出加「截止」列
- **MCP**（services/mcp）：
  - `create_task` / `update_task`：`dueDate` 可选参数
  - `list_tasks`：`dueDateFrom` / `dueDateTo` 可选参数

## 6. 移动端设计（apps/mobile）

### 6.1 页面结构

```
/task (TaskPage，AppShell 内)
├── Scaffold(body: IndexedStack, bottomNavigationBar: NavigationBar 4 tab)
│   ├── Tab 1 任务组: TaskGroupListView
│   ├── Tab 2 今日: TaskDueListView(overdue + today 分组)
│   ├── Tab 3 本周: TaskDueListView(week)
│   └── Tab 4 本月: TaskDueListView(month)
└── /task/groups/:id (TaskGroupDetailPage，全屏 push，带返回键)
```

- `TaskPage` 是嵌套 Scaffold：外层 `AppShell` 提供 AppBar + 抽屉，内层 `NavigationBar` 悬浮底部。`IndexedStack` 保持各 tab 滚动/加载状态
- 任务组详情页是全屏 push（不是 tab 内嵌导航），遵循现有 moments 详情的导航模式

### 6.2 各 tab 内容

| Tab | 内容 | 交互 |
|-----|------|------|
| 任务组 | 组卡片列表：组名 + 未完成任务数；空态引导新建 | 点击 → 组详情；长按或滑出菜单 → 改名/删除；右上「新建组」 |
| 今日 | 「已过期」组（dueDate < 今天，红/橙色标记）+「今天」组；仅未完成 | 快速勾选完成；点击 → 编辑；右上「新建任务」 |
| 本周/本月 | 单组列表；仅未完成 | 同上 |
| 组详情 | 组内所有任务（含 done/abandon，done 划线）；头部显示组名 | 新建/编辑/删除/完成 |

- 日期视图内点完成：成功后 invalidate 对应 provider（列表自动消失）
- 任务条目展示：标题 + 所属组名（日期视图下）+ 截止日期徽标（本周/本月 tab 显示具体日期；已过期红色）

### 6.3 新建/编辑

- 任务编辑用 **BottomSheet 表单**：标题（必填）、所属组（下拉，默认当前上下文组）、截止日期（`showDatePicker`，可清空）、状态（仅编辑时）
- 任务组：新建/改名复用简单对话框
- 删除需确认（`helpers.confirm` 等价物——Flutter 用 `showDialog` 确认）

### 6.4 API 层

- `TaskApi` 扩展：`listGroups` / `createGroup` / `updateGroup` / `deleteGroup` / `listTasks({groupId, status, dueFrom, dueTo})` / `createTask` / `updateTask` / `deleteTask` / `toggleComplete`（update status）
- `TaskModels`：`TaskEntry`、`TaskGroupEntry`、`CreateTaskInput` 等模型
- Riverpod providers：`taskApiProvider`（已有）+ 各组 provider（`taskGroupsProvider`、`taskListProvider(family)` 等）

### 6.5 抽屉 badge

- `/task` 的 badge 从写死的 `'3'` 改为真实未完成数（`countUncompleted()` 已有，复用）

## 7. 错误处理与一致性

- 复用现有 `humanizeError` / `ApiException` 模式（参考 moment 模块）
- 用户可见文案用中文
- 服务端校验失败（如 dueDate 格式错误）→ 显示中文错误提示

## 8. 测试

- **API**：`task.service.test.ts` 增加 dueDate 校验（格式、可空、清空）与 dueDate 范围过滤（含边界：当天、跨周）；`task.service.integration.test.ts` 增加 dueDate 过滤的真实 DB 用例
- **CLI**：`task create --due-date` / `task list --due-from --due-to` 的解析与输出
- **MCP**：工具参数 schema 变更后跑现有测试
- **Flutter**：`flutter analyze` + 手动验证（真机/模拟器）；widget 测试按现有惯例（项目当前 widget 测试较少，不强制新增）

## 9. 交付顺序

1. API：schema + types + service + 测试（`cd services/api && bun test`）
2. CLI：client + cmd flags + 表格列（`make test`）
3. MCP：工具参数（`bun test` at root）
4. Flutter：models/api → providers → 页面 → 路由 → badge 联动
5. 联调：模拟器手动验证四个 tab + CRUD
