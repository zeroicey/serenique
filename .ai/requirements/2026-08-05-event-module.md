# Event 模块需求文档

- 日期：2026-08-05
- 状态：**已实施完成**（API + MCP + CLI 全部落地；实施记录见 `.ai/worklog/2026-08-05-event-module-implementation.md`）
- 范围：API 服务 `services/api` 新增 Event 模块；MCP / CLI 已同步完成
- 业务参考：Go 参考项目 `serenique-test2/services/api/internal/modules/event`（handler / service / repository / model）；**规范按本项目约定**（分层架构、Zod、Drizzle、统一响应、中文文案）。

---

## 1. 背景与目标

Serenique API 已有 diary / moment / blob / task 模块。新增 **Event（日历事件）模块**，管理日程事件。单实体、无附件、无外键，业务核心是**时间范围**校验与**按时间窗口查询**。

---

## 2. 数据模型

### 2.1 参考 SQL（用户提供）

```sql
CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    is_all_day boolean NOT NULL,
    location text NULL,
    note text NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT events_end_after_start CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_events_start_end_at ON events (start_at, end_at);
```

### 2.2 Drizzle 设计（对齐 task 先例）

`src/modules/event/event.schema.ts`：

- `uuid("id").defaultRandom().primaryKey()`（迁移产物 `gen_random_uuid()`；参考 SQL 的 uuid 由应用生成，语义一致）。
- 时间列 `timestamp(..., { withTimezone: true })` → `timestamptz`（对齐参考 SQL）。
- `isAllDay`：`boolean("is_all_day").notNull().default(false)`。
- `location` / `note`：可空 `text`（不设长度上限，对齐参考 SQL）。
- CHECK：`chk_events_end_after_start`（`end_at > start_at`，DB 层兜底）；索引 `idx_events_start_end_at ON (start_at, end_at)`（对齐参考 SQL，匹配时间窗口查询）。
- `updatedAt` 使用 `.defaultNow().notNull().$onUpdate(() => new Date())`。

迁移 `drizzle/0007_lowly_pet_avengers.sql` 已生成并应用，表结构与参考 SQL 逐列一致。

---

## 3. 业务规则

- **标题必填**（trim 后非空，≤200 字）。
- **`end_at` 必须晚于 `start_at`**：service 层经 `event.domain.ts` 纯函数 `assertValidEventRange` 校验 + DB CHECK 双重保障。
- **列表为时间窗口查询（无分页）**：`GET /api/events?from=<ISO>&to=<ISO>`，返回与 `[from, to)` 重叠的事件（`WHERE start_at < to AND end_at > from`），按 `start_at ASC, created_at ASC` 排序；`to` 必须晚于 `from`。对齐 Go 参考的 `ListRange`。
- **时间字段格式**：`z.iso.datetime({ offset: true })`（接受 `Z` 或 `±hh:mm`，等价 Go `time.Parse(time.RFC3339)`）；service 转 `Date` 存储，条目回传 ISO 字符串。
- **更新为部分更新（PUT + 全部可选字段 + refine 至少一项）**：拉取当前行 → `resolveEventUpdate` 纯函数合并 → 校验范围 → 写回。`location`/`note` 传空串即清空（置空字符串；不支持下传 `null` 清空，对齐 Go 语义）。
- **用户可见文案中文**（与现有模块一致）。

---

## 4. API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events?from=&to=` | 时间窗口内的事件列表（重叠判定，start_at ASC） |
| POST | `/api/events` | 创建事件 `{ title, startAt, endAt, isAllDay?, location?, note? }` |
| GET | `/api/events/:id` | 事件详情 |
| PUT | `/api/events/:id` | 更新事件（至少一个字段） |
| DELETE | `/api/events/:id` | 删除事件（204） |

> 列表响应为**裸数组**（`data: [...]`），区别于 diary/moment/task 的 `{ items, total }`：时间窗口查询不涉及分页，对齐 Go 参考的 `[]Event`。

---

## 5. 模块文件结构与模式

目录 `src/modules/event/`，8 文件 + barrel（对齐 `decisions/2026-08-05-service-layer-architecture.md` 规范骨架）：

| 文件 | 用途 |
|------|------|
| `event.schema.ts` | Drizzle 表定义 |
| `event.types.ts` | Zod 校验 + 输入/输出类型 |
| `event.domain.ts` | 纯业务规则：`assertValidEventRange` / `assertValidListRange` / `resolveEventUpdate`（无 DB import，毫秒级单测） |
| `event.mappers.ts` | `toEventEntry` row→entry 纯函数 |
| `event.service.ts` | 导出单例 `eventService`，直接 `db` 编排 |
| `event.handler.ts` | Zod 解析 → service → `Res`，统一 `handleError` |
| `event.router.ts` | Hono 路由，挂载于 `/api` |
| `index.ts` | barrel `export { eventRouter }` |

要点：

- **end > start 规则不进 Zod refine**（保持在 domain 抛 AppError）：使 `CreateEventSchema` 保持普通对象、可被 MCP `.extend()`；`UpdateEventSchema` 因「至少一项」refine 仍为 `ZodEffects`，MCP 需手工重建（同 update_task 先例）。
- 条目类型 `EventEntry { id, title, startAt, endAt, isAllDay, location, note, createdAt, updatedAt }`，时间为 ISO 字符串。
- `list` 返回 `Promise<EventEntry[]>`（裸数组）。

---

## 6. 注册接线点（API 侧，共 3 处）

1. `src/db/schema.ts`：`export { events } from "@/modules/event/event.schema";`
2. `src/app.ts`：`import { eventRouter }` + `app.route("/api", eventRouter)` + 根路由 `modules` 数组加 `"event"`。
3. `src/exports.ts`：导出 `eventService`、Event 类型与 `CreateEventSchema` / `UpdateEventSchema` / `ListEventSchema`（供 MCP 消费）。

---

## 7. 测试策略

- **单元测试** `event.service.test.ts`（无库，18 个用例）：domain 纯函数（时间范围校验、`resolveEventUpdate` 合并与范围拒绝）、Zod schema（默认值、trim、非法日期、offset-less 拒绝、update 至少一项、list from/to）、mapper。
- **集成测试** `event.service.integration.test.ts`（DB 门控 `RUN_DB_TESTS=1`，8 个用例）：CRUD 往返、+08:00→UTC 转换、默认值、创建/更新倒挂范围 400、窗口重叠语义（完全在内/跨界/窗后/窗前）、start_at ASC 排序。afterAll 按 id 清理；标题带 run-token 前缀。
- 测试辅助 `test/helpers.ts` 增加 `fakeEventRow`。
- 已用临时 API 实例做 HTTP 冒烟：创建/非法范围 400/范围列表/详情/部分更新/204 删除/404/缺参 400，全部符合预期。

---

## 8. 后续阶段（本模块已完成）

- **MCP**：`src/tools/event.tools.ts`（create / list / get / update / delete_event），注册于 `server.ts` + `tools/index.ts`；`app.test.ts` 工具集断言同步更新。
- **CLI**：3 步模式 `internal/client/event.go` + `cmd/event.go` + `root.go` 注册；list 为自定义时间窗口命令（`--from` / `--to` 必填），非分页。
- **Docker**：重建 api / mcp 镜像。

---

## 9. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 时间字段格式 | `z.iso.datetime({ offset: true })`（接受 Z / ±hh:mm，等价 Go RFC3339） |
| ② | end>start 校验位置 | domain 纯函数抛 AppError + DB CHECK 双重；**不进 Zod refine**（保证 Create 可 `.extend()`） |
| ③ | 列表返回形态 | **裸数组**（时间窗口查询无分页，对齐 Go `[]Event`） |
| ④ | 更新语义 | **PUT + 全部可选 + refine 至少一项**（部分更新，对齐本项目 PUT 惯例） |
| ⑤ | location/note 清空 | 传空串置空；不支持下传 `null` 清空（对齐 Go `*string` 语义） |
| ⑥ | isAllDay 默认 | create 可选，默认 `false` |
