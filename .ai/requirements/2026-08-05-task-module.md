# Task 模块需求文档

- 日期：2026-08-05
- 状态：✅已实施（API + MCP + CLI 全部落地并评估通过；实施记录见 `.ai/worklog/2026-08-05-task-module-implementation.md`）
  - 2026-08-09 更新：✅移动端（Flutter `apps/mobile`）任务模块已实施 — 4-tab 任务页（任务组/今日/本周/本月）、组详情、创建/编辑弹窗、抽屉真实待办徽标；✅`dueDate`（截止日期，`text` 列 YYYY-MM-DD）已落地 API + MCP + CLI（`--due-date`/`--due-from`/`--due-to`）+ 移动端；全部跨端套件通过 + iOS 模拟器全流程烟测通过。记录见 `.ai/worklog/2026-08-09-task-module-mobile-task10.md` 与 `.ai/worklog/2026-08-09-task-module-mobile-dueDate.md`
- 范围：API 服务 `services/api` 新增 Task 模块；MCP / CLI 已同步完成；2026-08-09 扩展至移动端

---

## 1. 背景与目标

Serenique API 已完成 diary、moment 两个业务模块（另有底层 blob 模块），并配套 CLI（Go）与 MCP 服务。现新增 **Task（任务）模块** 进行任务管理。

本次范围（简单版）：

- **Task Group（任务组）** 与 **Task（任务）** 两个实体。
- 一个任务组可以包含多个任务；**一个任务只能属于一个任务组**（一对一多）。
- 先只做 API 服务层的实现与测试；评估通过后再扩展 CLI 与 MCP。

**优先级**：先对齐现有模块（diary / moment）的架构与代码风格，再实现 Task 模块。

---

## 2. 数据模型

### 2.1 参考 SQL（用户提供）

用户提供的参考 SQL（字段/约束/索引的语义依据，Drizzle 设计见 2.2）：

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    status text NOT NULL CHECK (status IN ('todo', 'done', 'abandon')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at_desc ON tasks (status, created_at DESC);

CREATE TABLE IF NOT EXISTS task_groups (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_id uuid;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_group_id;
ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_group_id
    FOREIGN KEY (group_id)
    REFERENCES task_groups(id)
    ON DELETE CASCADE;

ALTER TABLE tasks ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_groups_updated_at_desc ON task_groups (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_group_status_created_at_desc ON tasks (group_id, status, created_at DESC);
```

语义要点：

- `status` 为 `text` + `CHECK`（非原生 pg enum），取值 `todo / done / abandon`。
- `tasks.group_id` **NOT NULL**，外键 `ON DELETE CASCADE`（删任务组连带删任务）。
- 四个索引全部面向 **DESC / 组合过滤** 的查询习惯（最新优先、按组+状态筛选）。

### 2.2 Drizzle 设计（推荐）

对齐现有模块（diary / moment / blob）的 Drizzle 写法：

- `uuid("id").defaultRandom().primaryKey()`（迁移产物为 `gen_random_uuid()`）。
- `timestamp` 采用 `{ withTimezone: true }` → 迁移产物为 `timestamptz`（对齐参考 SQL；现有模块用的是普通 `timestamp`，见待决策点 ③）。
- `updatedAt` 使用 `.defaultNow().notNull().$onUpdate(() => new Date())`。
- `status` 用 `text` + `$type<TaskStatus>()` + `check()` 约束（对齐参考 SQL 的 text+CHECK；见待决策点 ④）。
- 索引全部用 `index("名字").on(t.col.desc(), ...)` 显式 DESC（对齐参考 SQL）。

`src/modules/task/task.schema.ts`：

```ts
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const TASK_STATUSES = ["todo", "done", "abandon"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const taskGroups = pgTable(
  "task_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("idx_task_groups_updated_at_desc").on(t.updatedAt.desc())],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => taskGroups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().$type<TaskStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_tasks_created_at_desc").on(t.createdAt.desc()),
    index("idx_tasks_status_created_at_desc").on(t.status, t.createdAt.desc()),
    index("idx_tasks_group_status_created_at_desc").on(
      t.groupId,
      t.status,
      t.createdAt.desc(),
    ),
    check("chk_tasks_status", sql`${t.status} IN ('todo', 'done', 'abandon')`),
  ],
);
```

> 注：`status` 列**不加** DB 默认值（对齐参考 SQL 无 DEFAULT），`"todo"` 默认由 Zod / service 层提供。
> 注：`group_id` 的 FK 约束名由 Drizzle 自动生成（`tasks_group_id_task_groups_id_fk`），参考 SQL 中的 `fk_tasks_group_id` 是增量迁移写法，语义一致即可，不强制同名。

---

## 3. 业务规则

- **任务必须属于某个任务组**（`groupId` NOT NULL）。创建/移动任务前先校验任务组存在（不存在 → `AppError(NOT_FOUND, 404)`）。
- **status ↔ completed_at 同步**（service 层逻辑，无 DB trigger）：
  - 创建时 `status = "todo"`、`completedAt = null`。
  - 更新进入 `done` → `completedAt = now()`（若当前为 null 或重新完成则刷新）。
  - 更新离开 `done`（→ `todo` / `abandon`）→ `completedAt = null`。
  - 更新状态保持 `done` 时（只改 title 等）→ `completedAt` 不变。
- **status 取值校验**：Zod `z.enum(["todo", "done", "abandon"])` + DB `CHECK` 双重保障。
- **删除任务组**：`ON DELETE CASCADE` 由数据库连带删除组内任务。
- **列表排序**：任务默认 `created_at DESC`；任务组默认 `updated_at DESC`（均对齐各自 DESC 索引）。
- 用户可见文案使用中文（与现有模块一致）。

---

## 4. API 路由

遵循现有 RESTful 风格（`diaries` / `moments` / `blobs`），扁平化路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/task-groups` | 任务组列表（分页 `?page=&pageSize=`，默认 updated_at DESC） |
| POST | `/api/task-groups` | 创建任务组 `{ title }` |
| GET | `/api/task-groups/:id` | 任务组详情 |
| PUT | `/api/task-groups/:id` | 重命名任务组 `{ title }` |
| DELETE | `/api/task-groups/:id` | 删除任务组（级联删任务） |
| GET | `/api/tasks` | 任务列表（分页 + `?groupId=` + `?status=` 过滤，created_at DESC） |
| POST | `/api/tasks` | 创建任务 `{ title, groupId, status? }` |
| GET | `/api/tasks/:id` | 任务详情 |
| PUT | `/api/tasks/:id` | 更新任务 `{ title?, groupId?, status? }`（至少一项） |
| DELETE | `/api/tasks/:id` | 删除任务 |

> 说明：任务按组查看用 `GET /api/tasks?groupId=`，不额外做嵌套路由（简单优先）。
> 任务组的列表/详情**暂不**返回 `taskCount`（见待决策点 ⑦）。

---

## 5. 模块文件结构与模式

目录 `src/modules/task/`，采用现有 **5 文件 + barrel** 模式：

| 文件 | 用途 |
|------|------|
| `task.schema.ts` | 两个 Drizzle 表定义（参照 blob.schema.ts 多表一文件的先例） |
| `task.types.ts` | Zod 校验 + 输入/输出类型 |
| `task.service.ts` | 业务逻辑 + DB 操作（**diary 简单模式**，已确认：直接导出 `taskService` 对象） |
| `task.handler.ts` | Zod 解析 → service → `Res` 响应（参照 moment.handler.ts 风格） |
| `task.router.ts` | Hono 路由 |
| `index.ts` | barrel：`export { taskRouter }` |
| `task.service.test.ts` | 纯函数单测 + 本地 Postgres 集成测试（见 §7） |

### 5.1 types（要点）

```ts
export const TaskStatusSchema = z.enum(["todo", "done", "abandon"]);

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  groupId: z.string().uuid(),
  status: TaskStatusSchema.default("todo"),
});
export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  groupId: z.string().uuid().optional(),
  status: TaskStatusSchema.optional(),
}).refine(v => v.title !== undefined || v.groupId !== undefined || v.status !== undefined,
  "至少需要提供一个待更新字段");
export const ListTaskSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  groupId: z.string().uuid().optional(),
  status: TaskStatusSchema.optional(),
});

export const CreateTaskGroupSchema = z.object({ title: z.string().min(1).max(200) });
export const UpdateTaskGroupSchema = z.object({ title: z.string().min(1).max(200) });
```

- `CreateTaskInput = z.input<typeof CreateTaskSchema>`：用 `z.input`（同 moment），允许 MCP 直接传裸对象，service 内部 `status ?? "todo"` 兜底。
- 条目类型：`TaskEntry { id, groupId, title, status, createdAt, updatedAt, completedAt }`；`TaskGroupEntry { id, title, createdAt, updatedAt }`（时间均为 `toISOString()` 字符串）。

### 5.2 service（diary 简单模式，已确认）

采用 diary 风格：**直接导出 `taskService` 对象**，方法内直接使用 `db`（来自 `@/db/connection`），不做 repository 抽象。参照 `diary.service.ts`。

```ts
export const taskService = {
  async createTaskGroup(input: CreateTaskGroupInput): Promise<TaskGroupEntry> { /* ... */ },
  async listTaskGroups(input: ListTaskGroupInput): Promise<{ items: TaskGroupEntry[]; total: number }> { /* ... */ },
  async getTaskGroup(input: GetTaskGroupInput): Promise<TaskGroupEntry> { /* ... */ },
  async updateTaskGroup(input: UpdateTaskGroupInput): Promise<TaskGroupEntry> { /* ... */ },
  async deleteTaskGroup(input: DeleteTaskGroupInput): Promise<{ id: string }> { /* ... */ },
  async createTask(input: CreateTaskInput): Promise<TaskEntry> { /* ... */ },
  async listTasks(input: ListTaskInput): Promise<{ items: TaskEntry[]; total: number }> { /* ... */ },
  async getTask(input: GetTaskInput): Promise<TaskEntry> { /* ... */ },
  async updateTask(input: UpdateTaskInput): Promise<TaskEntry> { /* ... */ },
  async deleteTask(input: DeleteTaskInput): Promise<{ id: string }> { /* ... */ },
};
```

- 每个方法：校验 → db 操作 → `toEntry()` 转换（Date → ISO 字符串），出错抛 `AppError`。
- **status ↔ completedAt 的同步抽成纯函数**，便于无库单测：
  - `nextCompletedAt(nextStatus: TaskStatus, now: Date): Date | null` —— **仅由目标状态决定**：进入 `done` 返回 `now`，其余返回 `null`（评估后简化，去掉了实际无效的 currentStatus 参数）。
  - `resolveTaskUpdate(current, patch, now)` —— 组合标题/任务组/状态变更与 completedAt 结果；**"保持 done 不变"**（patch 不含 status）由该函数的 `patch.status === undefined ? current.completedAt : nextCompletedAt(...)` 分支实现；§3 的"重新完成则刷新"（done→done 刷新 completedAt）由 `nextCompletedAt("done", now)` 返回 now 实现。
- 任务组存在性校验：`createTask` / `updateTask` 先查任务组，不存在 → `AppError(NOT_FOUND, "任务组不存在", 404)`。
- `createTask` 内部 `status ?? "todo"` 兜底（`CreateTaskInput` 用 `z.input`，兼容 MCP 传裸对象）。

### 5.3 handler / router

- handler 参照 moment.handler.ts（`UuidParamSchema`、`getId()`、`handleError()`）。
- 响应：创建 `Res.created`、列表/详情 `Res.ok`、更新 `Res.ok`、删除 `Res.noContent`。

---

## 6. 注册接线点（API 侧，共 3 处）

1. `src/db/schema.ts`：追加 `export { taskGroups, tasks } from "@/modules/task/task.schema";`（Drizzle Kit 读取此文件生成迁移）。
2. `src/app.ts`：
   - `import { taskRouter } from "@/modules/task";`
   - `app.route("/api", taskRouter);`
   - `/` 元信息路由的 `modules` 数组追加 `"task"`。
3. `src/exports.ts`：导出 `taskService`、Task 相关类型与 Zod schemas（供 MCP 消费）。

然后 `bun run db:generate` 生成迁移、`bun run db:migrate` 应用，并跑 `bun run typecheck` 与 `bun test`。

---

## 7. 测试策略

选用 diary 简单模式后，**不做**内存 repository 单测；改为：

- **纯函数单测（无库）**——`task.service.test.ts` 覆盖：
  - `nextCompletedAt` / `resolveTaskUpdate` 的 status ↔ completedAt 同步规则（进入 done 写入、离开 done 清空、保持 done 不变）。
  - 非法 status 拒绝（结合 Zod schema 测试）。
- **Zod 校验测试**——参照 `moment.service.test.ts` 的 schema 测试段（如 `CreateTaskSchema.safeParse({ title, groupId })` 成功、非法 status 失败）。
- **集成测试（连本地 Postgres，可选）**——参照 `setTestEnv()`（DATABASE_URL 指向 127.0.0.1:5432）模式：
  - 任务组 CRUD、任务 CRUD。
  - `groupId` / `status` 过滤列表、created_at DESC 排序。
  - 创建/移动任务到不存在的任务组 → 404。
  - 删除任务组 → 组内任务被级联删除。
  - 注意：集成测试要求本地 Postgres 已启动（与现有测试环境假设一致）。
- 实施后由多个评估 agent 执行验证（架构一致性、契约、边界、安全），通过后再进入 MCP / CLI 阶段。

---

## 8. 后续阶段（评估通过后再做）

- **MCP**：新增 `src/tools/task.tools.ts`（任务组 + 任务 CRUD 工具），在 `src/server.ts` 注册 `registerTaskTools(server)`。
- **CLI**：按 3 步模式新增 `serenique task` 命令 —— `internal/client/task.go`（类型化方法）→ `cmd/task.go`（cobra 命令）→ `cmd/root.go` 注册；遵循 stdout 纯净、错误非零退出、`--json` 等硬契约。
- 时间字段契约与 API 源保持一致（`title` / `groupId` / `status` / `completedAt`）。

---

## 9. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | service 层风格 | **diary 简单模式**：直接导出 `taskService` 对象（用户确认） |
| ② | `groupId` 是否必填 | **必填**：NOT NULL，任务必须归属一个任务组（用户确认） |
| ③ | 时间列类型 | **`timestamptz`**（`withTimezone: true`，遵循参考 SQL；全库唯一 timestamptz 表，可接受） |
| ④ | status 校验 | **DB `CHECK` + Zod 双重**（遵循参考 SQL） |
| ⑤ | 标题长度上限 | **200**（可调） |
| ⑥ | 列表排序 | **任务 `created_at DESC`、任务组 `updated_at DESC`**（对齐各自索引；组排序为实施时修正） |
| ⑦ | 任务组列表是否带 `taskCount` | **暂不返回**（用户确认，后续需要再加） |
