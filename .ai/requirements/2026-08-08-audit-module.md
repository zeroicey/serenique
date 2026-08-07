# 服务端日志（Server Audit Log）模块需求文档

- 日期：2026-08-08
- 状态：**设计中**（方案已确认，实施未开始）
- 范围：`services/api` 新增 `audit` 模块（同级别独立模块）；写方钩入 auth / blob / diary / moment / task / event；读方先服务 Web（轮询角标 + 日志页），CLI / 移动端后补
- 前置记录：`2026-08-06-auth.md`（登录 / 登出事件来源）、`2026-08-04-blob-storage-module.md`（上传 / 删除事件来源）、`2026-08-08-mcp-sunset.md`（MCP 停更，不接入）

---

## 1. 背景与目标

Serenique 已公网暴露且多端接入（Web / CLI / 移动端），但目前用户**无法从客户端看到服务端发生了什么**——登录是否被试探、文件何时被删、公网是否有未授权请求。本项目为个人单用户应用，不需要多用户审计，需要的是**对"服务端重要操作"的可见性**，外加已读 / 未读的提醒语义。

目标：

- 客户端**轮询或手动刷新**即可查看服务端重要操作，不需要长连接 / WebSocket。
- 只记录**状态变更 / 安全相关**的操作；不记录读操作（列表 / 详情 / me）——防噪音。
- 有**已读 / 未读**状态；**不做删除功能**；靠自动清理防表无限膨胀。

---

## 2. 模块定位（已确认）

- **同级别独立模块**：与 diary / moment / task / event / blob 同级，标准 6 文件 + barrel + 双层测试。
- 与普通 CRUD 模块的唯一差异：audit **对外只读、对内只写**——各业务 service 调 `auditService.record()` 写入，客户端只打读接口。
- 命名 **`audit`**：路由 `/api/audit/logs`，表 `audit_logs`。
- 传输：HTTP GET / PUT，轮询 / 手动刷新；不做长连接或 WebSocket（已确认）。

---

## 3. 数据模型（`audit_logs`）

```ts
export const AUDIT_LEVELS = ["info", "warn", "error"] as const;
export type AuditLevel = (typeof AUDIT_LEVELS)[number];

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  event: text("event").notNull(),                              // 事件类型 key，如 "auth.login"
  message: text("message").notNull(),                          // 人类可读中文消息
  level: text("level").$type<AuditLevel>().notNull().default("info"),
  source: text("source"),                                      // 来源端：web / cli / mobile / unknown（尽力而为）
  ip: text("ip"),                                              // 客户端 IP（登录类、401 事件必带）
  detail: jsonb("detail").$type<Record<string, unknown>>(),    // 可扩展载荷（对齐 blob.metadata 约定，不校验）
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_audit_logs_created_at_desc").on(t.createdAt.desc()),
  index("idx_audit_logs_is_read_created_at_desc").on(t.isRead, t.createdAt.desc()),
  index("idx_audit_logs_event_created_at_desc").on(t.event, t.createdAt.desc()),
]);
```

关键取舍：

- **没有 `updatedAt`**：日志是 append-only 的不可变记录，唯一会变的是 `is_read`（批量置已读），行级 `updatedAt` 无意义。这是全库仅有的两张没有 `updatedAt` 的表之一（先例：`blobs`），**有意为之**。
- **已读 / 未读用逐条 `is_read` 布尔**（已确认，否决全局时间游标 `last_read_at`）：可精确标记「我看到的这批」，随后新到的不会被误吞。
- **`source` 尽力而为**：本库无跨请求来源识别，且写入点多在 service 层（无请求上下文），当前实现下 `source` 通常为 `null`；客户端可带 `X-Client` 头提示（可选），后续需要时再扩展。
- 3 个 DESC 索引，对齐全库「最新优先」的查询习惯。

---

## 4. 事件类型与写入点（范围已确认）

| event | level | 何时写 | 写入点 |
|-------|-------|--------|--------|
| `auth.login` | info | 登录成功（带 IP） | `auth.handler.ts` login |
| `auth.login_failed` | warn | 密钥错误 / 被限流（带 IP） | `auth.handler.ts` login |
| `auth.logout` | info | 退出登录 | `auth.handler.ts` logout |
| `auth.unauthorized` | warn | 未认证 / 凭证错误请求（401，带 IP + 去重） | `auth.middleware.ts` |
| `blob.upload` | info | 文件上传 | `blob.service.ts` |
| `blob.delete` | warn | 物理删除文件 | `blob.service.ts` |
| `diary.delete` / `moment.delete` / `task.delete` / `event.delete` | warn | 删除业务数据 | 各 `*.service.ts` delete |
| `task_group.delete` | warn | 删除任务组（级联删组内任务） | `task.service.ts` deleteTaskGroup |

**401 去重（防扫描器刷屏）**：`auth.unauthorized` 按 IP 限频，同一 IP 在窗口（默认 10 分钟）内只记第一条，窗口外重置。状态在内存 Map，复用 auth 模块的 throttle 清理模式（状态转移纯函数在 `auth.domain`、`_sweep` 定期清理在 `auth.service`；audit 侧同样拆 domain 纯函数 + service 清理）。进程重启后 Map 清空，可接受。

**刻意不记录**：读操作（列表 / 详情 / `me`）、未变更数据的重复写、MCP 内部直连操作（MCP 已停更）、blob 上传去重命中（checksum 命中复用既有记录，不算新上传）、`blob cleanup-orphans` 维护清扫、moment 附件 / 评论删除（暂不记录，需要时再加）。

**IP 可信度**：`clientIp` 直读反代 / 直连头（`cf-connecting-ip` / `x-forwarded-for`），生产在 Cloudflare 后由 CF 覆盖、可信；若直连暴露则头可伪造（既污染审计也骗去重）。实施时把 `clientIp` 从 `auth.handler.ts` 抽到 `@/shared` 导出，handler 与 auth.middleware 共用。

---

## 5. 业务规则

- **写方 fire-and-forget**：`void auditService.record(...).catch(err => logger.error({ err }, "audit record failed"))`——永不阻塞 / 影响主流程（登录接口即使 DB 慢 / 挂，record 失败也只记 Pino，登录照常成功）。
- **auth 事件在 handler 记录**（需要 `clientIp(c)`；401 在 middleware 记录，同样用抽出的共享 `clientIp`）；**删除 / 上传事件在 service 记录**（顺带覆盖 MCP 直连路径，保持一致性）。
- 不记录读操作（见 §4）。
- 无删除 API（用户要求）；保留靠自动清理（§7）。
- 用户可见文案（`message` 字段）使用中文，与现有模块一致。

---

## 6. API 路由（读侧）

| 方法 | 路径 | 响应 `data` 结构 | 说明 |
|------|------|------------------|------|
| GET | `/api/audit/logs` | `{ items: LogEntry[]; total: number }` | 列表（`?page=&pageSize=`，默认 10 最大 50；+ `?level=` & `?event=` & `?unreadOnly=`，`created_at DESC`）。`LogEntry` = `{ id, event, message, level, source, ip, detail, isRead, createdAt }` |
| GET | `/api/audit/logs/unread-count` | `{ unreadCount: number }` | 未读数，Web 角标轮询 |
| PUT | `/api/audit/logs/read` | `{ updatedCount: number; unreadCount: number }` | 全部置已读；body 可带 `{ ids?: string[] }` 精准标记（空数组视为未提供 → 全部已读；`ids` 上限 500，超限报 400） |

整条 `/api` 已挂在 auth 中间件之后，日志含 IP / 失败尝试，**只有持有密钥的部署者自己能看**（读接口不额外放行）。无删除接口。

---

## 7. 保留策略（自动清理，已确认）

- **默认**：保留 90 天且最多 5000 条，超出部分后台清扫删除。**清扫顺序：先按 `AUDIT_RETENTION_DAYS` 删超龄，再按 `AUDIT_MAX_ROWS` 截断**（`ORDER BY created_at DESC` 删最旧），避免截断后残留超龄行。
- 阈值可配：环境变量 `AUDIT_RETENTION_DAYS=90` / `AUDIT_MAX_ROWS=5000`（可选，缺省用默认值）。
- **定时器生命周期**：清扫定时器由 `index.ts` 显式启动（对齐 `initBlobRoot` 模式），`NODE_ENV === "test"` 时不启动，避免单测 import service 泄漏定时器。
- 清扫是「防膨胀」的内部维护，**非用户删除功能**。

---

## 8. 模块文件结构

目录 `src/modules/audit/`，标准 6 文件 + barrel + 双层测试：

| 文件 | 用途 |
|------|------|
| `audit.schema.ts` | `audit_logs` 表定义 |
| `audit.types.ts` | Zod 校验（Record / List / MarkRead）+ 事件注册表（`AUDIT_EVENTS` 枚举） |
| `audit.domain.ts` | 纯函数：消息构建、401 去重状态机（无 DB / IO，对齐 auth.domain） |
| `audit.service.ts` | `auditService`：`record` / `list` / `unreadCount` / `markRead` / `sweep` + 去重 Map 的 `_sweep` 清理 |
| `audit.handler.ts` | Zod 解析 → service → `Res` 响应 |
| `audit.router.ts` | Hono 读接口路由 |
| `index.ts` | barrel：`export { auditRouter }` |
| `audit.domain.test.ts` / `audit.service.test.ts` / `audit.service.integration.test.ts` | 双层测试（对齐 service-layer 架构约定） |

---

## 9. 注册接线点（API 侧）

1. `src/db/schema.ts`：`export { auditLogs } from "@/modules/audit/audit.schema";`（Drizzle Kit 读取生成迁移）。
2. `src/app.ts`：`app.route("/api", auditRouter)` + `/` 元信息 `modules` 数组追加 `"audit"`。
3. `src/exports.ts`：导出 `auditService`、audit 类型与 Zod schemas（供 CLI 等外部消费者；MCP 停更中，不新增接入）。
4. 写方钩子（§4 表格）：`auth.handler.ts`、`auth.middleware.ts`、`blob.service.ts`、`diary.service.ts`、`moment.service.ts`、`task.service.ts`、`event.service.ts` 插入 `record` 调用。

5. `src/env.ts`：加可选字段 `AUDIT_RETENTION_DAYS` / `AUDIT_MAX_ROWS`（`z.coerce.number().int().positive().optional()`），同步 `.env.example`。

然后生成并提交迁移 `drizzle/0009_*.sql`（`db:generate` 需 TTY；或 CI 用 `db:push`），`bun run typecheck` 与 `bun test`。

---

## 10. 测试策略

- `audit.domain.test.ts`（无 DB）：401 去重（窗口内只记一条 / 窗口外重置）、事件注册表、消息构建。
- `audit.service.test.ts`（无 DB）：`record` / `list` / `read` 的 Zod 校验。
- `audit.service.integration.test.ts`（`RUN_DB_TESTS=1`）：`record → list → unread-count → mark-read` 全链路；写方钩子触发（登录成功 / 失败写行、删除业务数据写行、401 去重写行）。
- 实施后由评估 agent 验证（架构一致性、契约、边界、安全），通过后再进入 Web / CLI 阶段。

---

## 11. 后续阶段（实施后接）

- **Web**：侧边栏角标（轮询 `unread-count`，如 30s）+ 日志页（列表 + 已读 / 未读筛选 + 全部已读按钮）。
- **CLI**：`serenique logs` 命令（列表 / 未读 / 全部已读），遵循 stdout 纯净、`--json`、错误非零退出等硬契约。
- **移动端 Flutter**：规划预留。
- **MCP**：停更中（见 `2026-08-08-mcp-sunset.md`），**不接入**。

---

## 12. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 模块定位 | **同级别独立模块**（非轻量 MVP、非挂靠） |
| ② | 命名 | **`audit`**（`/api/audit/logs`，表 `audit_logs`） |
| ③ | 传输 | **HTTP 轮询 / 手动刷新**，不做长连接 / WebSocket |
| ④ | 记录范围 | `auth.login` / `auth.login_failed` / `auth.logout` / `auth.unauthorized` / `blob.upload` / `blob.delete` / `diary.delete` / `moment.delete` / `task.delete` / `task_group.delete` / `event.delete` |
| ⑤ | 已读 / 未读 | 逐条 `is_read` 布尔（否决全局游标 `last_read_at`） |
| ⑥ | 删除 | **不做删除功能**（用户要求） |
| ⑦ | 保留 | **自动清理**（`AUDIT_RETENTION_DAYS=90` / `AUDIT_MAX_ROWS=5000`，可选可配） |
| ⑧ | 写方 | `auditService.record()` fire-and-forget，永不拖垮主流程 |
| ⑨ | 401 噪音 | 按 IP 去重，窗口默认 10 分钟 |
| ⑩ | 事件写入位置 | auth 在 handler（需 IP；401 在 middleware）；删除 / 上传在 service |
