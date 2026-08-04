# 服务层架构统一重构实施日志（2026-08-05）

规范方案见 `.ai/decisions/2026-08-05-service-layer-architecture.md`。本日志记录实施、测试改写与踩坑。

## 完成内容

### 规范骨架落地（四模块统一 8 文件）

- **diary**：新建 `diary.domain.ts`（`todayStr`/`isFutureDate`，`isFutureDate` 加 `today` 注入参数以便无时钟单测）、`diary.mappers.ts`（`toDiaryEntry`）；`diary.service.ts` 保留 5 个编排方法直接 `db`。补全新 `diary.service.test.ts`（6 case）+ `diary.service.integration.test.ts`（5 case）。
- **task**：纯函数迁 `task.domain.ts`（`nextCompletedAt`/`resolveTaskUpdate` + 3 个 type），映射迁 `task.mappers.ts`（`toTaskEntry`/`toTaskGroupEntry`）；service 只留编排。单测 import 改向 domain + 补 mapper case；集成测试换共享 `setTestEnv`。
- **moment**（最大头）：删除 `MomentRepository` 接口、`createDrizzleMomentRepository`、`createMomentService` 工厂。`moment.domain.ts`（mime 白名单/`normalizeSortOrder`/`MOMENT_ATTACHMENT_OWNER_TYPE`）、`moment.mappers.ts`（`toMomentEntry`/`toMomentBlobEntry`/`toMomentAttachmentEntry`/`sortAttachments`/`groupAttachmentsByMomentId`）。service 变单例，事务用 `db.transaction`，tx 类型用 `Parameters<Parameters<typeof db.transaction>[0]>[0]` 提取；跨 db/tx 复用的查询 helper 参数用 `Pick<typeof db, "select"|"insert"|"update"|"delete">`。重写单测（12 case，删内存 repo 与 `repository: any`）+ 新集成测试（7 case：附件排序/mime 拒绝回滚/列表/追加排序/删引用/级联/404）。
- **blob**：删除 `BlobRepository`/`BlobStorage`/`CreateBlobServiceDeps`/`createBlobService`/适配器。`blob.domain.ts`（`assertBlobSize`/`isChecksumUniqueConflict`/`errorMessage`/`requireSigningSecret`/`signBlobAccess`/`signaturesEqual`/`looksLikeSvg`/`normalizeUploadedMimeType`/`assertGenericAttachmentOwnerType`）、`blob.mappers.ts`（`toPublicBlobEntry`/`toBlobAttachmentEntry`）。service 变单例直接 db+storage+env。单测重写（14 case）+ 新集成测试（10 case：真实 PNG 宽高/去重/并发竞态/SVG 伪装/删除保护/孤儿清理/getFile/签名链接/moment 保留/列表过滤）。

### 测试基建

- 新建 `src/test/helpers.ts`：`setTestEnv`（**强制** BLOB_ROOT 为 run-unique 目录；`??=` DATABASE_URL；默认 TEST_SIGNING_SECRET）、`RUN_DB_TESTS`、`RUN_TOKEN`、`uniqueTitle`/`titlePrefix`、行工厂 `fakeDiaryRow`/`fakeMomentRow`/`fakeBlobRow`/`fakeTaskRow`/`fakeTaskGroupRow`。
- 新建 `docker-compose.test.yml`（postgres:16，serenique/serenique/serenique，5432，healthcheck）。
- `services/api/package.json` 补 `test`/`test:integration`/`test:db:up/down/migrate`/`test:integration:full`（起库→migrate→RUN_DB_TESTS=1 跑集成→`;` 停库）。
- 四个 handler 统一用 `shared/handler.ts` 的 `handleError`；blob 两处 204 改 `Res.noContent`；新增 `src/app.test.ts` 契约冒烟（4 case，DB-free）。
- blob.handler.test.ts / storage.test.ts 的本地 `setTestEnv` 换共享 helper。

### 发现并修复的 2 个真实生产 bug

1. **并发去重竞态从未在真实 PG 生效**：drizzle-orm 把 PostgresJS 错误包成 `DrizzleQueryError`，真实错误在 `.cause` 里（字段是 `constraint_name` 而非 `constraint`）。原 `isChecksumUniqueConflict` 只查 `constraint` → 竞态时 23505 漏出 → 500。已改为解包 `.cause` + 同时检查 `constraint`/`constraint_name`。**集成测试的真实并发上传（`Promise.all([upload, upload])`）暴露并锁住此行为。**
2. **blob 附件接口非法 JSON → 500**：blob 的 `handleError` 缺 SyntaxError→400 分支。统一到共享 `handleError` 后对齐为 400（与 diary/moment/task 一致），`app.test.ts` 锁定。

## 对下一次会话的提示（pitfalls）

- **`bun test` 共享单进程跑所有文件**：`@/env` 在首个 import 它的文件处解析一次、全进程缓存。任何测试文件**不得静态 import 会拉 `@/env` 的模块**（如 `@/shared/storage` → logger → env），必须 `setTestEnv()` 之后动态 import。BLOB_ROOT/BLOB_SIGNING_SECRET 须在首个 `@/env` 解析前设好（`setTestEnv` 已强制 run-unique BLOB_ROOT + 默认 secret）。
- **集成测试不要关共享连接池**：`db.$client.end()` 会弄死同进程后续文件（CONNECTION_ENDED）。bun 测完自动退出，不关池即可。
- **blob/moment 集成测试内容必须 run-unique**（追加 `RUN_TOKEN`）：DB 级 checksum 去重会让残留行跨 run 干扰断言。PNG 头后追加 RUN_TOKEN 不影响宽高解析。
- **测试残留清理**：失败运行的 untracked blob 行会留在共享 dev DB。可用 original_name 匹配一次性清理；或 `bun run test:integration:full` 成功后 afterAll 已按 createdBlobIds 自清。
- **service 输入类型**：`z.coerce` 字段会让 `z.input` 变成 `unknown`（blob `sortOrder`），用显式结构类型替代（见 `blob.types.ts` 注释）。
- **`exports.ts` 不要动**：MCP 依赖其导出面（服务单例名 + 被 `.extend()`/`.shape` 的 schema 字段与默认值）。本次重构 exports.ts 零改动。
- **运行集成测试**：`cd services/api && bun run test:integration:full`；`bun run test:db:up` 若本机已有 PG 占 5432 会报端口冲突，此时跳过 up/down 直接用现有 PG。
