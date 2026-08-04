# Task 模块实施与评估日志（2026-08-05）

需求文档（定稿）：`.ai/requirements/2026-08-05-task-module.md`。本日志记录实施、评估、修复与踩坑。

## 本次完成

### API（services/api）
- 新增 `src/modules/task/`：`task.schema.ts` / `task.types.ts` / `task.service.ts` / `task.handler.ts` / `task.router.ts` / `index.ts` / `task.service.test.ts`。
- 接线 3 处：`db/schema.ts`（表注册）、`app.ts`（/api 挂载 + 根路由 modules 加 "task"）、`exports.ts`（taskService + 类型 + Zod）。
- 迁移：`drizzle/0006_rich_franklin_richards.sql`（timestamptz、`chk_tasks_status` CHECK、`group_id` NOT NULL FK `ON DELETE CASCADE`、四个 DESC 索引）。
- 服务层**diary 简单模式**（直接导出 `taskService`，无 repository 抽象）；status↔completedAt 抽成纯函数 `nextCompletedAt(nextStatus, now)` / `resolveTaskUpdate(current, patch, now)`。
- 关键决策：groupId **NOT NULL**（任务必须归属任务组）；任务组列表按 `updated_at DESC`、任务列表按 `created_at DESC`（各自对齐索引）；标题 ≤200 且 `.trim()`；status DB CHECK + Zod 双重；时间列 `timestamptz`（全库唯一，现有 diary/moment 是普通 timestamp）。

### MCP（services/mcp）
- 新增 `src/tools/task.tools.ts`：10 个工具（任务组 create/list/get/update/delete + 任务 create/list/get/update/delete），注册于 `server.ts` 与 `tools/index.ts`；`app.test.ts` 的工具集断言同步更新。

### CLI（apps/cli）
- 3 步模式：`internal/client/task.go`（10 个类型化方法）+ `cmd/task.go`（task 根 + 子命令）+ `root.go` 注册；含 `cmd/task_test.go`（16）+ `internal/client/task_test.go`（6）；README 更新。
- 命令树：`task group create/list/get/update/delete`、`task create/list/get/update/delete`。子命令统一 `get`/`update`（与 diary/moment 一致；初版误用 view/rename 已修正）。
- 硬契约逐条符合（错误非零退出、stdout 纯净、--json、confirm、truncateRunes、可取消 context、List 泛型自由函数）。

## 评估结果（多 agent 对抗性验证）

### API —— 首轮 9 条真实问题，全部修复，二次复核 0 回归
1. **medium** `updateTask` 非原子读改写：并发删除缺 `!row` 守卫 → 500 崩溃；并发编辑 → 丢失更新（已做最小安全修复：补守卫 + FK 23503→404；丢失更新记为已知限制）。
2. TOCTOU：组在存在性检查后被并发删除 → FK 23503 → 500（捕获转 404）。
3. `shared/response.ts` 204 带 JSON body，违反 RFC 9110（diary/moment 同病）→ 204 改空 body。
4. 非法/空 JSON body → 500 → task/diary/moment 三个 handleError 映射 400。
5. 全空白标题被接受 → 四个 schema 加 `.trim()`。
6. `nextCompletedAt` 死分支 + 误导注释 → 简化为 `(nextStatus, now)`。
7. DB 级业务规则无集成测试 —— **决策：暂缓**（本地 PG 就绪后再补）。
8. service 边界不收非 UUID id —— **决策：调用方校验**（与 diary/moment 一致，MCP 工具用 `z.string().uuid()`）。

### CLI + MCP —— 接受性评估 1 条 high，已修复
- MCP `update_task` 工具 schema 在重建时误把 title/groupId/status 设为必填，破坏部分更新 → 改回 `.optional()` 并保留 refine。CLI 0 问题。

## 全仓最终验证
- 根 `bun run typecheck`（api+mcp）通过；API `bun test` **36 过**；MCP `bun test` **39 过**；CLI `go build ./... && go vet ./... && go test -count=1 ./...` 4 包全 ok。

## 对下一次会话的提示（pitfalls）
- **API 的 package.json 没有 `test` script**：跑测试要 `cd services/api && bun test`；`bun run --cwd services/api test` 会报 "script test was not found"。
- Drizzle 0.45：`check(name, sql)` / `index(name).on(col.desc())` 写在表配置回调里；`.desc()` 只存在于 ExtraConfigColumn（表内 `orderBy` 要用 `desc()` 工具函数）。
- Zod v4：顶层 `.refine()` 产生 `ZodEffects`，**没有 `.extend()`**。MCP 工具若需重建带 refine 的 API schema，必须手工保留全部 `.optional()` 与 refine（本次 update_task 就栽在这）。
- 参考 SQL 的 `task_groups` 索引是 `updated_at DESC`、`tasks` 是 `created_at DESC`：**列表排序必须与各自索引对齐**。
- `shared/response.ts` 的 204 语义已改（空 body、无 Content-Type）：任何 DELETE 消费者（CLI/MCP）不应依赖删除响应 body。
- 规格中「保持 done 不变」由 `resolveTaskUpdate` 的 `patch.status === undefined ? current.completedAt : ...` 分支实现；`nextCompletedAt` 只由目标状态决定（进入 done → now，其余 → null）。
