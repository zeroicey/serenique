# Push 通知模块（通知中心 + 定时调度）需求文档

- 日期：2026-08-08
- 状态：**设计中**（表设计 + 通用机制方案已确认，实施未开始）
- 范围：`services/api` 新增 `push` 模块（同级别独立模块）；**本阶段只交付通用机制**（`pushService.create` 供内部模块调用 + 外部创建接口 + 通知中心读接口 + 状态机 + 后台处理器），不接具体业务钩子
- 前置记录：`2026-08-08-audit-module.md`（模块骨架 / 事件注册 / 读侧约定 / Zod v4 陷阱）、`2026-08-08-mcp-sunset.md`（MCP 停更，不接入）

---

## 1. 背景与目标

Serenique 需要一个**通用的推送/通知能力**：系统内部模块（如未来的事件提醒、任务到期）或第三方外部服务（如服务器检查脚本）能创建一条**定时推送**，客户端通过轮询查看（通知中心），未来离线推送（APNs/FCM）再作为额外送达渠道接入。

目标：

- **通用机制先行**：`pushService.create()` 是内部触发契约，任意业务模块可调用；`POST /api/pushes` 是外部触发接口，可指定推送时间。
- **通知中心读侧**：客户端轮询 `unread-count` 角标 + `list` 列表 + 置已读，不需要长连接 / WebSocket。
- **调度语义**：`scheduledAt` 决定送达时间，默认 now（立即）；未来时间 = 定时提醒。
- **离线推送后置**：本阶段不接 APNs/FCM，`status` 状态机为未来队列预留。

---

## 2. 模块定位（已确认）

- **同级别独立模块**：与 diary / moment / task / event / blob / audit 同级，标准 6 文件 + barrel + 双层测试。
- 与 audit 的差异：audit 对内只写、对外只读；push 是**对内写（内部模块调 service）+ 对外也写（外部创建接口）+ 对客户端读（通知中心）**。
- 命名 **`push`**：路由 `/api/pushes`，表 `push_notifications`。
- 传输：HTTP GET / PUT / POST / DELETE，轮询 / 手动刷新；不做长连接或 WebSocket（已确认）。

---

## 3. 数据模型（`push_notifications`）

```ts
export const PUSH_STATUSES = ["pending", "sent"] as const;
export type PushStatus = (typeof PUSH_STATUSES)[number];

export const pushNotifications = pgTable("push_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),                              // 通知标题（≤100）
  body: text("body").notNull(),                                // 通知正文（中文，≤500）
  type: text("type"),                                          // 类型 key，自由文本 + 点号命名（如 "event.reminder" / "server.check"）
  status: text("status").$type<PushStatus>().notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(), // 送达时间，默认 now
  sentAt: timestamp("sent_at", { withTimezone: true }),        // 翻为 sent 的时刻（dispatcher 写，日志自明）
  isRead: boolean("is_read").notNull().default(false),
  source: text("source"),                                      // 来源：internal / external / web / cli / mobile（尽力而为）
  detail: jsonb("detail").$type<Record<string, unknown>>(),    // 可扩展载荷（对齐 blob.metadata / audit.detail 约定，不校验）
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_push_status_scheduled_at").on(t.status, t.scheduledAt),             // 队列查询：待推送且到期
  index("idx_push_scheduled_at_desc").on(t.scheduledAt.desc()),                  // 列表按通知时间倒序
  index("idx_push_is_read_scheduled_at_desc").on(t.isRead, t.scheduledAt.desc()),// 未读角标 / 未读筛选
  index("idx_push_type_scheduled_at_desc").on(t.type, t.scheduledAt.desc()),     // 类型筛选
]);
```

关键取舍（均已确认）：

- **有 `updatedAt`**——区别于 audit（append-only 无 updatedAt）。push 是可变的：改期、状态翻转、置已读，行级变更时间有意义。
- **`status` 是未来离线推送的队列簿记**：dispatcher 把「到期且 pending」翻成 sent，未来 APNs/FCM 读 `WHERE status='pending' AND scheduled_at<=now` 取队列。**通知中心的"可读/未读"不依赖 status**，直接用 `scheduled_at <= now` 判断（避免 dispatcher 延迟影响角标及时性）。
- **`scheduledAt` 默认 now** = 立即推送；第三方指定未来时间 = 定时提醒。
- **`type` 自由文本 + 点号命名约定**（非硬枚举）：本阶段不接业务钩子，硬枚举会是空壳；外部第三方需要自由度。筛选照常工作。
- **`sentAt` 保留**：dispatcher 翻状态时写，日志自明（已确认保留）。
- **4 个索引**覆盖：队列查询、最新优先列表、未读角标、类型筛选。

---

## 4. 触发机制

### (a) 内部触发（通用机制，已确认本阶段只做机制不接钩子）

- 契约：`pushService.create(input)`（await 返回 entry）或 `firePushCreate(input)`（fire-and-forget，绝不阻塞调用方主流程）。
- 通过 `@serenique/api` 的 `exports.ts` 导出 `pushService`，任何业务模块 / 未来 CLI 可调用。
- 示例业务钩子（**本阶段不接入**，留给后续）：事件提醒（创建事件时建 `scheduledAt=事件开始前 N 分钟` 的提醒）、任务到期、日常提醒等。

### (b) 外部触发（已确认复用 `AUTH_TOKEN`）

- `POST /api/pushes`（Bearer `AUTH_TOKEN`，整条 `/api` 已在 auth 中间件之后，天然受保护）。
- body：`{ title, body }` 必填；`scheduledAt?`（默认 now）/ `type?` / `detail?` 可选。
- 「第三方」= 部署者自己的外部脚本 / 服务（如服务器健康检查），已持有密钥，无需新增配置。

---

## 5. 业务规则

- **创建**：`title` ≤100、`body` ≤500、`type` ≤50、`scheduledAt` 合法 ISO 时间（默认 now）。
- **更新**：仅 `pending` 可改（`title` / `body` / `scheduledAt` / `type` / `detail`）；`sent` 是不可变记录，改需先删（`push.domain.ts` 纯函数 `canUpdate` 校验，返回 400「已推送的通知不可修改」）。
- **未读语义**：`unreadCount` = `scheduled_at <= now AND is_read = false`；`unreadOnly` 列表筛选同理。
- **置已读**：`PUT /api/pushes/read` body `{ ids? }`——空数组（或缺省）视为未提供 → 全部置已读；`ids` 上限 500，超限报 400（对齐 audit `markRead`）。
- **删除**：物理删除即取消，任意状态都允许。
- **dispatcher**（`pushService.process()`）：翻「到期且 pending」→ sent（写 `sentAt`）+ 保留清理（§7）。后台定时器 `startPushProcessor` 由 `index.ts` 显式启动（对齐 audit sweeper），间隔 ~30s，`NODE_ENV === "test"` 不启动。
- **写方不阻塞**：内部模块用 `firePushCreate`；外部创建接口正常 await 并返回 entry。
- 用户可见文案（`body`）使用中文，与现有模块一致。

---

## 6. API 路由

| 方法 | 路径 | 响应 `data` 结构 | 说明 |
|------|------|------------------|------|
| POST | `/api/pushes` | `{ id, title, body, type, status, scheduledAt, sentAt, isRead, source, detail, createdAt, updatedAt }` | 创建（外部触发；`scheduledAt` 默认 now） |
| GET | `/api/pushes` | `{ items: PushEntry[]; total: number }` | 列表（`?page=&pageSize=` 默认 10 最大 50；+ `?status=` & `?type=` & `?unreadOnly=`，`scheduled_at DESC`） |
| GET | `/api/pushes/unread-count` | `{ unreadCount: number }` | 未读数，Web 角标轮询 |
| GET | `/api/pushes/:id` | `PushEntry` | 详情（404 若不存在） |
| PUT | `/api/pushes/:id` | `PushEntry` | 改期/编辑（仅 pending） |
| PUT | `/api/pushes/read` | `{ updatedCount: number; unreadCount: number }` | 置已读（`{ ids? }`，空=全部） |
| DELETE | `/api/pushes/:id` | 204 no content | 删除即取消，任意状态（`Res.noContent("推送删除成功")`） |

`PushEntry` = `{ id, title, body, type, status, scheduledAt, sentAt, isRead, source, detail, createdAt, updatedAt }`（时间为 ISO 字符串）。

路由注册顺序：`unread-count` / `read` 必须在 `:id` 之前（对齐 diary `by-date` 先例）。整条 `/api` 已挂 auth 中间件之后，外部创建受 `AUTH_TOKEN` 保护。

---

## 7. 保留策略（自动清理，已确认）

- **默认**：保留 90 天且最多 5000 条，超出部分由 dispatcher 清扫删除。**顺序：先按 `PUSH_RETENTION_DAYS` 删超龄，再按 `PUSH_MAX_ROWS` 截断**（`ORDER BY scheduled_at DESC` 删最旧），避免截断后残留超龄行（对齐 audit sweep）。
- 阈值可配：环境变量 `PUSH_RETENTION_DAYS=90` / `PUSH_MAX_ROWS=5000`（可选，缺省用默认值）。
- 清扫是「防膨胀」的内部维护，非用户删除功能（用户删除走 §6 DELETE）。

---

## 8. 模块文件结构

目录 `src/modules/push/`，标准 6 文件 + barrel + 双层测试：

| 文件 | 用途 |
|------|------|
| `push.schema.ts` | `push_notifications` 表定义 + `PUSH_STATUSES` |
| `push.types.ts` | Zod 校验（Create / Update / List / MarkRead）+ 输入/输出类型 |
| `push.domain.ts` | 纯函数：`canUpdate`（仅 pending 可改）、`isDue`（可读/未读判定），无 DB / IO |
| `push.service.ts` | `pushService`：`create` / `list` / `get` / `update` / `markRead` / `unreadCount` / `remove` / `process`；`firePushCreate`；`startPushProcessor` |
| `push.handler.ts` | Zod 解析 → service → `Res` 响应 |
| `push.router.ts` | Hono 路由 |
| `index.ts` | barrel：`export { pushRouter }` |
| `push.domain.test.ts` / `push.service.test.ts` / `push.service.integration.test.ts` | 双层测试（对齐 service-layer 架构约定） |

---

## 9. 注册接线点（API 侧）

1. `src/db/schema.ts`：`export { pushNotifications } from "@/modules/push/push.schema";`（Drizzle Kit 读取生成迁移）。
2. `src/app.ts`：`app.route("/api", pushRouter)` + `/` 元信息 `modules` 数组追加 `"push"`。
3. `src/exports.ts`：导出 `pushService`、push 类型与 Zod schemas（供内部模块 / CLI 消费；MCP 停更中，不新增接入）。
4. `src/index.ts`：`NODE_ENV !== "test"` 时 `startPushProcessor()`（对齐 `startAuditSweeper`）。
5. `src/env.ts`：加可选字段 `PUSH_RETENTION_DAYS` / `PUSH_MAX_ROWS`（`z.coerce.number().int().positive().optional()`），同步 `.env.example`。

然后生成并提交迁移 `drizzle/0010_add_push_notifications.sql`（当前最新为 `0009_add_audit_logs.sql`；`bunx drizzle-kit generate --name add_push_notifications` 非 TTY 可跑），`bun run typecheck` 与 `bun test`。

---

## 10. 测试策略

- `push.domain.test.ts`（无 DB）：`canUpdate`（pending 可改 / sent 不可改）、`isDue`（到期 / 未到期）。
- `push.service.test.ts`（无 DB）：Create / Update / List / MarkRead 的 Zod 校验（scheduledAt 默认 now、type 自由文本、unreadOnly 的 `"true"/"false"` 解析）。
- `push.service.integration.test.ts`（`RUN_DB_TESTS=1`）：create → list → unread-count → markRead → update(pending) → delete 全链路；未来 scheduledAt 保持 pending；`process()` 翻到期行、不翻未到期；保留清理（先按天删再按条数截断）。
- 实施后由评估 agent 验证（架构一致性、契约、边界、安全），通过后再进入 Web / CLI / 移动端阶段。

---

## 11. 后续阶段（实施后接）

- **具体业务钩子**：事件提醒 / 任务到期 / 日常提醒等，各模块调 `pushService.create()`。
- **Web / 移动端**：通知中心页 + 角标轮询 `unread-count`（复用 audit 的 Web 轮询模式）。
- **CLI**：`serenique push` 命令（创建 / 列表 / 已读 / 删除），遵循 stdout 纯净、`--json`、错误非零退出等硬契约。
- **离线推送**：dispatcher 或独立通道读 `status='pending' AND scheduled_at<=now` 队列，经 APNs/FCM 发送后置 sent（本阶段仅翻状态）。
- **MCP**：停更中（见 `2026-08-08-mcp-sunset.md`），**不接入**。

---

## 12. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 模块定位 | **同级别独立模块**（非轻量 MVP、非挂靠） |
| ② | 命名 | **`push`**（`/api/pushes`，表 `push_notifications`） |
| ③ | 送达语义 | **通知中心**（读接口 + `isRead` + 未读角标），离线推送后续作为额外送达渠道 |
| ④ | 传输 | **HTTP 轮询 / 手动刷新**，不做长连接 / WebSocket |
| ⑤ | 内部触发 | **只做通用机制**（`pushService.create` / `firePushCreate`），不接具体业务钩子 |
| ⑥ | 外部触发鉴权 | **复用 `AUTH_TOKEN`**（不新增独立密钥、不放行白名单） |
| ⑦ | 表设计 | **单表 + 状态机**（`push_notifications`，`pending → sent`）；否决双表队列/中心分离、纯事件派发器 |
| ⑧ | `type` 字段 | **自由文本 + 点号命名约定**（可空），非硬枚举 |
| ⑨ | `sentAt` | **保留**（dispatcher 日志自明） |
| ⑩ | 删除 / 改期 | **物理删除即取消**（任意状态）+ **仅 pending 可改期/编辑**（sent 不可变） |
| ⑪ | 保留 | **自动清理**（`PUSH_RETENTION_DAYS=90` / `PUSH_MAX_ROWS=5000`，可选可配，先按天删再截断） |
| ⑫ | 置已读 | audit 同款 `{ ids? }` 批量语义（空 = 全部，上限 500） |
| ⑬ | dispatcher | 后台定时器 `startPushProcessor`（~30s），`index.ts` 启动，test 跳过 |
| ⑭ | 未读语义 | `scheduled_at <= now AND is_read = false`（不依赖 status，避免 dispatcher 延迟影响角标） |
