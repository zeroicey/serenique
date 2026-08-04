# 服务层分层架构规范（Service-Layer Architecture）

日期: 2026-08-05

适用范围: `services/api/src/modules/*`（diary / moment / task / blob 及未来模块）

## 背景

API 四个模块的 service 层此前存在三种写法：diary/task 是"简单单例直接 `db`"（task 额外抽了纯函数），moment/blob 是"repository 接口 + 工厂注入"。根因是历史演化（blob 首版为无 DB 单测引入 DI，moment 加附件时照搬），且仓库没有任何文档为模块架构定调。

探索核查确认了三个事实：
1. **与 MCP 无关**：MCP 只消费 `exports.ts` 里的 service 单例 + Zod schema，从不接触 repository/工厂。
2. **工厂/repository 符号全仓零外部引用**（仅各自 service 文件与测试内）。
3. **`exports.ts` 导出面可零改动**：4 个单例名与所有被 MCP `.extend()`/`.shape` 的 Zod schema 都留在原地。

## 决策

统一为**分层模块架构**：业务规则与数据访问彻底分层，service 只做编排。

### 1. 推翻旧决策：blob 不再用 DI / repository

**本文取代 `2026-08-04-blob-storage-module.md` 中「Repository 适配 Drizzle；`createBlobService()` 支持依赖注入，方便测试不用真实 PostgreSQL」条款**，以及其"测试覆盖"一节依赖内存 double 的部分。

**Why**：个人工具，接口 + 工厂 + 注入带来三份重复代码（接口、Drizzle 适配器、测试 double），且测试 double 靠 `as any` 编译、与真实库行为漂移。集成测试已可用（`RUN_DB_TESTS=1` + 本地 PG），能测真实行为。

**How to apply**：service 只导出单例对象，直接 `db` / `@/shared/*` / `@/env`；不要新建 repository 接口、工厂或注入。

### 2. 规范骨架：8 文件 + 职责边界

每模块固定骨架，核心 6 文件 + 按需 2 个扩展文件：

| 文件 | 职责 | 允许的 import |
|---|---|---|
| `*.schema.ts` | Drizzle 表定义 | drizzle-orm 仅 |
| `*.types.ts` | Zod schema + 输入/输出类型 | zod、本模块 schema（type-only） |
| `*.domain.ts` | **纯业务规则/计算/校验，禁止 import db/IO** | `@/shared/errors`、`node:crypto` 等纯计算 |
| `*.mappers.ts` | row→entry 转换，纯函数 | 本模块 schema/types（type-only） |
| `*.service.ts` | 导出**单例对象**，只做编排：直接 `db`/`@/shared/*`/`@/env`，调 domain/mappers，抛 AppError | db/connection、@/env、@/shared/*、本模块 domain/mappers/types |
| `*.handler.ts` | parse→service→`Res`，统一用共享 `handleError`（`shared/handler.ts`） | 本模块 types/service、@/shared/handler |
| `*.router.ts` | Hono 路由 | 本模块 handler |
| `index.ts` | barrel re-export router | 本模块 router |

**Why**：把"值得单测的逻辑"（校验/计算/状态转换）抽成纯函数后毫秒级可测，且不需要维护任何 fake；`*.service.ts` 只留编排，天然变薄，不再出现 400+ 行的混装文件。

**How to apply**：新模块照此骨架建文件。service 方法统一 `(input: XxxInput) => Promise<Entry | { items, total }>`。多写操作用 `db.transaction(...)`；事务内复用的查询，helper 参数用最小客户端类型（如 `Pick<typeof db, "select"|"insert"|"update"|"delete">`）以同时兼容 `db` 与事务 `tx`。

### 3. 测试分层规范

两层 + 共享基建：

| 文件 | 内容 | 门控 |
|---|---|---|
| `*.service.test.ts` | domain 纯函数 + mappers + Zod schema，无 DB | 无 |
| `*.service.integration.test.ts` | 真 PG（blob 加真实磁盘），复用 task 集成范本 | `RUN_DB_TESTS=1` + `describe.skipIf` |

共享 helper：`services/api/src/test/helpers.ts`（`setTestEnv` / `RUN_DB_TESTS` / `RUN_TOKEN` / `uniqueTitle` / 行工厂）。集成测试不关共享连接池（bun 单进程跑所有文件，关池会弄死后续文件）。

**Why**：消灭 `repository: any` / `as any` / 内存 double；纯逻辑单测毫秒级、DB 行为用真 PG 覆盖真实约束/事务/并发。

**How to apply**：每模块至少一个 `*.service.test.ts` 与一个 `*.service.integration.test.ts`；集成测试内容带 `RUN_TOKEN` 前缀保证幂等。

### 4. handler 与 REST 契约

- 错误映射统一走 `shared/handler.ts` 的 `handleError(e, c, scope?)`：AppError→其 status；ZodError→400；**SyntaxError（非法 JSON）→400**；其余→500。
- 204 一律用 `Res.noContent(...)`（`.build()` 对 204 特判为空 body），不要直写 `c.body(null, 204)`。
- `exports.ts` 导出面、MCP 工具面、REST 字段契约（moment 用 `text`、204 空 body）为硬约束，不得随意改动。

### 5. 已否决选项（一句话）

generic CRUD factory、ports & adapters（repository 接口 + 注入）、testcontainers 均因对个人工具过度抽象/过度基建而否决。

## 硬约束（续守）

- `exports.ts` 只导出服务单例 + Zod schema + 类型 + 共享工具；被 MCP `.extend()`/`.shape` 的 schema 字段名与默认值语义不变。
- 全仓唯一 `db` 连接（`db/connection.ts`），不要新建连接池。
- 服务层 `AppError` 是唯一业务错误通道；handler 层统一转 HTTP。
