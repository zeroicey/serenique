# AI 用户视角测试反馈修复日志（2026-08-05）

来源：`.ai/issuses/2026-08-05-ai-user-testing-feedback.md`（CLI + MCP 双通道实测反馈）。修复 API / MCP / CLI 三层的 P1–P3 问题并调整体验。

## 修复内容

### P1 · HTTP API 无效 UUID 返回 400（原 500）（services/api）

- **根因**：`diary.handler.ts` 与 `blob.handler.ts` 的 `getId()` 只检查 `!id`，不校验 UUID 格式，无效值下钻 service → 数据库异常 → `handleError` 落 500。task/event/moment 已用 `z.string().uuid()`，不受影响。
- **修复**：`shared/handler.ts` 新增公共 `uuidParam(c, name)`（缺失 → 400 VALIDATION；非 UUID → zod 校验 400），与 MCP 工具 schema 同款 `uuid()` pattern。5 个模块 handler 统一改用（diary/blob 补齐校验，task/event/moment 去重本地 `UuidParamSchema`/`getId`）。
- **测试**：`src/app.test.ts` 新增回归测试，覆盖 5 模块 9 条无效 UUID 路径（get/delete/file/attachment），全部断言 400 而非 500（无 DB，纯 handler 层）。

### P2 · MCP `upload_blob` 返回容器内地址（services/mcp + docker）

- **根因**：`docker-compose.yml` 把 `SERENIQUE_API_BASE_URL` 设为 compose 服务主机名 `http://api:3000`，MCP 把该值直接拼进 `curlExample`，宿主机无法解析。
- **修复**：`env.ts` 新增可选 `SERENIQUE_PUBLIC_API_BASE_URL`；`blob.tools.ts` 抽出纯函数 `buildUploadEndpoint(apiBaseUrl, publicBaseUrl)`，优先用公开地址、缺省回退 API 地址。`docker-compose.yml` 设 `SERENIQUE_PUBLIC_API_BASE_URL: ${SERENIQUE_PUBLIC_API_BASE_URL:-http://localhost:3000}`（API 端口已发布到 localhost），`.env.example` 补文档。
- **测试**：`services/mcp/src/upload-blob-url.test.ts`（纯函数 3 例：优先公开地址 / 回退 / 去尾斜杠）。已有 `upload_blob` 全链路测试覆盖默认回退路径。

### P2 · CLI 事件表格显示 UTC 无时区标注（apps/cli）

- **根因**：`cmd/event.go` 的 `eventTimeLabel` 只 `prefix(s, 19)` 截断 UTC 字符串（`2026-08-05T01:00:00Z` → `2026-08-05T01:00:00`），无本地转换、无偏移标注。
- **修复**：改为 `time.Parse(RFC3339Nano) → t.Local().Format("2006-01-02T15:04:05Z07:00")`，本地时区渲染并始终带偏移（用户输 `+08:00` 看到 `+08:00`）。`event get` 的创建/更新时间同样本地化。`--json` 保持原始 UTC 值不变（机器可读）。
- **测试**：`cmd/event_test.go` 断言改为与机器时区无关的本地期望值 + 显式偏移存在性检查；对运行中 API 实测 create/list/get 均显示 `2026-08-05T09:00:00+08:00`。

### P3 · MCP `list_events` 结构与其余 list 统一（services/mcp）

- **根因**：`list_events` 直接返回 `eventService.list` 的裸数组，其余 list 工具均返回 `{items, total}`，AI/脚本解析需分支。
- **修复**：MCP 工具层包装为 `{items, total}`（`total = items.length`）；HTTP/CLI 契约不变（仍是裸数组，时间窗口无分页）。工具描述注明返回结构与 `list_diaries` 等一致。
- **验证**：对本地 DB 实跑 `create_event` → `list_events`（`{items, total}` 且新事件在内）→ `delete_event` 清理，DB 恢复。

### P3 · CLI 帮助文案打磨（apps/cli）

- `blob detach --help` 注明「仅支持非 moment 类型（如 diary），闪念附件请用 `serenique moment detach <moment-id> <attachment-id>`」。
- `blob upload --help` 注明 `--json` 批量结果位于 `data.results[].blobId`（成功）/`error`（失败），与单文件命令 `data.id` 字段名不同（D6 设计，非缺陷，仅显式标注）。

## 验证结果

- API：`bun run typecheck` 通过；`bun test` 76 pass / 52 skip / 0 fail（新增无效 UUID 回归测试在内）。
- MCP：`bun run typecheck` 通过；`bun test` 6 pass / 0 fail（含 upload URL 纯函数测试）。
- CLI：`go build ./... && go vet ./... && go test -count=1 ./...` 4 包全 ok。
- 端到端：对运行中 API 实测事件 create/list/get 本地时区渲染正确，测试数据已清理（事件数恢复 0）。

## 对下一次会话的提示（pitfalls）

- **无效 UUID 现在统一 400**：handler 层必须用 `shared/handler.ts` 的 `uuidParam(c, name)`，禁止手写 `c.req.param()` + 只判空。
- **MCP `list_events` 在工具层包装为 `{items, total}`**，但 **HTTP/CLI 契约仍是裸数组**：CLI `ListEvents` 继续按裸数组解码；只有 MCP 端 `event.tools.ts` 包装。不要改 HTTP 路由，也不要让 CLI 去套 `client.List[T]` / `paginatedListCommand`。
- **`SERENIQUE_PUBLIC_API_BASE_URL` 语义**：MCP 返回给用户的对外地址；`SERENIQUE_API_BASE_URL` 是 MCP 内部视角（Docker 里是 `http://api:3000`）。新增 Docker 部署时按 `.env.example` 的注释设置公开地址。
- **事件时间展示**：CLI 表格模式本地时区 + 偏移渲染，`--json` 保持服务器原始 UTC。改表头或格式时同步 `cmd/event_test.go` 的 `TestEventHelpers`（与时区无关的写法）。
