# Event 模块实施与评估日志（2026-08-05）

需求文档（定稿）：`.ai/requirements/2026-08-05-event-module.md`。本日志记录 API / MCP / CLI 三层的实施与最终验证。

## 本次完成

### API（services/api）
- 新增 `src/modules/event/`：`event.schema.ts` / `event.types.ts` / `event.domain.ts` / `event.mappers.ts` / `event.service.ts` / `event.handler.ts` / `event.router.ts` / `index.ts` / `event.service.test.ts`（18 单测）+ `event.service.integration.test.ts`（8 集成）。
- 接线 3 处：`db/schema.ts`（表注册）、`app.ts`（/api 挂载 + 根路由 modules 加 "event"）、`exports.ts`（eventService + 类型 + Zod）。
- 迁移：`drizzle/0007_lowly_pet_avengers.sql`（timestamptz、`chk_events_end_after_start` CHECK、`(start_at, end_at)` 索引），表结构与参考 SQL 逐列一致，已应用到本地 DB。
- 业务对齐 Go 参考：**时间窗口列表**（`?from=&to=` 重叠判定 `start_at < to AND end_at > from`，start_at ASC）；end>start 双重重（domain 抛 AppError + DB CHECK）；`z.iso.datetime({ offset: true })`（接受 Z / ±hh:mm，等价 Go RFC3339）。
- 关键决策：列表返回**裸数组**（非 `{items,total}`，时间窗口无分页）；end>start **不进 Zod refine**（保持 Create 可 `.extend()`，Update 因「至少一项」refine 由 MCP 手工重建）；location/note 可空、传空串清空（不支持 null 清空）。

### MCP（services/mcp）
- 新增 `src/tools/event.tools.ts`：5 个工具（create / list / get / update / delete_event），注册于 `server.ts` + `tools/index.ts`；`app.test.ts` 工具集断言同步更新（27 个工具）。

### CLI（apps/cli）
- 3 步模式：`internal/client/event.go`（EventEntry + 5 个类型化方法；`ListEvents` 解码裸数组）+ `cmd/event.go`（event 根 + create/list/get/update/delete 子命令）+ `root.go` 注册；含 `cmd/event_test.go`（10）+ `internal/client/event_test.go`（6）。
- list 为**自定义时间窗口命令**（`--from` / `--to` 必填，非分页，`--all` 不适用）。
- 新增 `validateISO` 本地校验（RFC3339Nano 解析，接受秒/毫秒、拒绝无偏移），错误信息可直接行动；`--to` 无短横（根命令 `-t` 已被 `--token` 占用）。
- 硬契约逐条符合（错误非零退出、stdout 纯净、--json、confirm、truncateRunes、可取消 context）。

### Docker
- `docker compose build` 因构建容器无法直连 `registry.npmjs.org`（`ConnectionRefused`）失败 → 注入宿主机代理 build args（`--build-arg http_proxy=http://host.docker.internal:7897`）后构建成功；`docker compose up -d api mcp` 重建容器。坑点已记入 CLAUDE.md 的 Docker build network note。

## 验证结果

- API：`bun run typecheck` 通过；`bun test` 75 pass / 52 skip / 0 fail；`RUN_DB_TESTS=1` 全模块集成 42 pass（含 event 8 个）。
- 迁移后本地 DB 表结构逐列对照参考 SQL：通过。
- HTTP 冒烟（临时实例 + 运行中 Docker API）：创建（+08:00→UTC）、非法范围 400、范围列表、详情、部分更新、204 删除、404、缺参 400，全部符合预期。
- MCP：`bun test` 3 pass；对运行中容器做 JSON-RPC `tools/list`（27 个工具，含 5 个 event）+ `tools/call create_event`（创建成功，时区正确）。
- CLI：`go build ./... && go vet ./... && go test -count=1 ./...` 4 包全 ok；对运行中 API 端到端：create/get/update（改名+清空地点）/JSON/delete/404，全部符合硬契约。

## 对下一次会话的提示（pitfalls）

- **Docker 构建必须注入宿主机代理**：本机 `docker compose build` 直接跑会因 `bun install` 连不上 npmjs 而失败；用 CLAUDE.md 里的 `--build-arg http_proxy=http://host.docker.internal:7897` 等。仅重建时需要，`up -d` 不需要。
- **时间窗口列表返回裸数组**（`data: [...]`），不是 `{items, total}`：CLI 的 `ListEvents` 与 MCP `list_events` 都按裸数组解码，不要套用 `client.List[T]` / `paginatedListCommand`。
- `z.iso.datetime()` 默认**只接受 `Z`**（UTC），要兼容 `+08:00` 必须用 `z.iso.datetime({ offset: true })`（本次踩坑：2 个单测因默认行为失败）。
- Zod v4 顶层 `.refine()` 产生 `ZodEffects`，没有 `.extend()`：`UpdateEventSchema` 在 MCP 端必须手工重建并保留全部 `.optional()` 与 refine（同 update_task 先例）；`CreateEventSchema` 因 end>start 校验放在 domain 而非 refine，保持可 `.extend()`。
- end>start 的 DB CHECK（`chk_events_end_after_start`）是兜底：service 层经 `assertValidEventRange` 先拦，集成测试断言 400 且行不变。
- CLI 短横冲突：根命令持久 `-t` 已被 `--token` 占用，event list 的 `--to` 不留短横；其余 `-n/-s/-e/-a/-l/-f` 均安全。

> 标准流程已抽到 `.ai/runbooks/docker-local-build.md`，本文件保留事件记录。
