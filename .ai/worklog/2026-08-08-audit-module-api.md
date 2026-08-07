# 2026-08-08 — API：新增 audit 服务端日志模块

## 背景

需求文档 `.ai/requirements/2026-08-08-audit-module.md`（已确认设计）。Serenique 公网多端接入，
用户无法从客户端看到服务端发生了什么。本模块提供**只读**的服务端重要操作日志（登录/401/删除/上传），
带已读/未读语义与自动清理，供 Web 角标轮询 + 日志页、CLI `serenique logs`（见
`2026-08-08-audit-module-cli.md`）消费。MCP 停更不接入。

## 改动

### 1. audit 模块（`services/api/src/modules/audit/`）

标准 6 文件 + barrel + mappers + 双层测试：

| 文件 | 内容 |
|------|------|
| `audit.schema.ts` | `audit_logs` 表：id/event/message/level/source/ip/detail(jsonb)/isRead/createdAt(tz)；3 个 DESC 索引；**无 updatedAt**（与 blobs 同类 append-only） |
| `audit.types.ts` | `AUDIT_EVENTS` 事件注册表（11 个）；`RecordAuditSchema` / `ListAuditSchema` / `MarkReadSchema` |
| `audit.domain.ts` | `EVENT_MESSAGES` 中文消息注册表 + `buildEventMessage`；401 按 IP 去重状态机（窗口 10 分钟，纯函数） |
| `audit.mappers.ts` | row→entry 纯函数（createdAt→ISO） |
| `audit.service.ts` | `auditService` 单例：`record` / `list` / `unreadCount` / `markRead` / `sweep` / `recordUnauthorized`；`fireAuditRecord` 写方封装；`startAuditSweeper` 定时器 |
| `audit.handler.ts` / `audit.router.ts` / `index.ts` | GET `/api/audit/logs`、GET `/api/audit/logs/unread-count`、PUT `/api/audit/logs/read` |

### 2. 接线

- `db/schema.ts`：注册 `auditLogs`（Drizzle Kit 据此生成迁移）。
- `app.ts`：挂 `app.route("/api", auditRouter)`，`/` 元信息 modules 数组追加 `"audit"`。
- `exports.ts`：导出 `auditService` + `AUDIT_EVENTS` + 三个 Zod schema + 类型（供 CLI/MCP 消费）。
- `env.ts` / `.env.example`：可选 `AUDIT_RETENTION_DAYS` / `AUDIT_MAX_ROWS`（`z.coerce.number().int().positive().optional()`）。
- `index.ts`：`NODE_ENV !== "test"` 时 `startAuditSweeper()`（对齐 `initBlobRoot` 模式，测试不泄漏定时器）。

### 3. 写方钩子（全部 fire-and-forget，绝不阻塞主流程）

| 事件 | 写入点 |
|------|--------|
| `auth.login` / `auth.login_failed`（含 throttled） / `auth.logout` | `auth.handler.ts`（带 IP） |
| `auth.unauthorized` | `auth.middleware.ts` 两个 401 分支，按 IP 去重（10 分钟窗口） |
| `blob.upload`（checksum 去重命中不记）/ `blob.delete` | `blob.service.ts` |
| `diary.delete` / `event.delete` | `diary.service.ts` / `event.service.ts` |
| `moment.delete` | `moment.service.ts` |
| `task.delete` / `task_group.delete` | `task.service.ts` |

`clientIp()` 从 `auth.handler.ts` 抽到 `src/shared/ip.ts`，handler 与 middleware 共用。

### 4. 迁移

`bunx drizzle-kit generate --name add_audit_logs`（非 TTY 也能跑）→ `drizzle/0009_add_audit_logs.sql`
+ `meta/0009_snapshot.json` + `_journal.json` idx 9。本地 PG 已 `drizzle-kit migrate` 应用并验证
表结构/索引。

## 验证

- `bun run typecheck`（api 单包 + 根命令含 mcp/web）：通过。
- `bun test`（单元）：121 pass / 76 skip / 0 fail。
- `RUN_DB_TESTS=1 bun test src/modules/audit/*.integration.test.ts`：6 pass / 0 fail。
- 全量集成 `RUN_DB_TESTS=1 bun test src/modules/*/*.integration.test.ts`：61 pass / 1 fail——
  **1 个失败为存量问题**：`moment comment service DB integration > list embeds commentCount`
  （commit `290332d` 让 moment list 内嵌 `comments[]`，但该测试仍断言 `comments === []`），
  与本次改动无关（本次未碰 moment 列表逻辑）。

## 坑与给下次的提示

1. **Zod v4 破坏性变更**：`z.enum(x)` 的 x 必须导入为**值**（不是 type-only import）；
   `z.record()` 现在需要**两个参数** `z.record(z.string(), z.unknown())`（v3 一个参数会编译错）。
2. **`z.coerce.boolean()` 陷阱**：query 里 `?unreadOnly=false` 会被 coerce 成 `true`。`ListAuditSchema`
   用 `z.enum(["true","false"]).transform(v => v === "true")` 显式解析。
3. **401 去重 Map 是进程内状态**：auth throttle 与 audit 去重都共享 `bun test` 单进程。集成测试
   必须用**唯一 IP**（`it-${RUN_TOKEN}-...`），否则会被同进程其它文件的 401 写入去重吞掉断言。
4. **fire-and-forget 的竞态**：中间件/服务触发的 audit 插入是异步的，测试需轮询 DB 等待（`waitForAuditRows`），
   不能立即断言。
5. **markRead({}) 会标记全局**：`bun test` 各文件共享同一张 `audit_logs` 表，断言「全部已读后 unreadCount
   === 0」会被并发文件写入破坏。集成测试改为断言**自己的 tagged 行**已读。
6. **`db:generate` 非 TTY 可跑**：`bunx drizzle-kit generate --name xxx` 在非交互 shell 下正常工作，
   会自动生成 SQL + snapshot + journal，无需手写。
7. 清理阈值顺序**先按天删、再按条数截断**（`sweep()`），避免截断后残留超龄行。
