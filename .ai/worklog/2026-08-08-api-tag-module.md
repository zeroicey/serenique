# 2026-08-08 — API 全局标签系统（tags 模块 + Moment 接入）

实施 `.ai/requirements/2026-08-05-moment-tags.md`（2026-08-08 复审版）：新增独立 tags 模块（标签 + 通用多态关联表），Moment 全面接入（内联 tags、`?tag=` 过滤、嵌套接口、删除清理）。MCP 无需改代码（经 `.extend()` 自动继承）；CLI 的 `Tags` 字段同步属另一任务（工作树中已有他人在做 CLI/mobile/web）。

## 实现（services/api）

**新模块 `src/modules/tag/`**（对齐 task 模块骨架）：
- `tag.schema.ts`：`tags`（name unique + updatedAt `$onUpdate`）+ `tag_relations`（tag_id FK ON DELETE CASCADE、表级唯一 `(tag_id, owner_type, owner_id)`、仅 `(owner_type, owner_id)` 索引——不建 tag_id 单独索引，决策⑯）。
- `tag.types.ts`：Create/Rename/List/Attach/Detach/ReplaceTags 六个 Zod schema + `TagEntry`（含 momentCount）+ `TagRelationEntry`。
- `tag.domain.ts`：纯函数——`normalizeTagName`（trim+小写，中文 no-op）、`uniqueTagIds` 去重、**ownerType 注册表**（`registerOwnerValidator`/`assertRegisteredOwnerType`/`getOwnerValidator`，当前仅 "moment"）、`isUniqueViolation(err, constraint)` / `isForeignKeyViolation`（unwrap drizzle `.cause`，对齐 blob.domain 模式）。
- `tag.mappers.ts`：`toTagEntry` / `toTagRelationEntry` / `groupTagEntriesByOwnerId`。
- `tag.service.ts`：单例 `tagService`（create/list/get/rename/delete/attach/detach/replaceForOwner）+ 跨模块 helper（`listTagEntriesByOwnerIds` / `createTagRelationsForOwner` / `listOwnerIdsByTagId`，最小 `DbClient` 类型兼容 tx）。unique violation → `ErrorCode.CONFLICT` 409（创建/重命名/attach 竞态）；attach 事务内校验 tag + owner；replaceForOwner 幂等集合语义（容忍已绑定、空数组清空、不存在 404、整事务回滚、按请求序返回）。moment 校验器在模块加载时注册（唯一一处 `as DbClient` cast）。
- `tag.handler.ts` / `tag.router.ts` / `index.ts`：7 条路由（GET/POST /api/tags、GET/PUT/DELETE /api/tags/:id、POST attach、DELETE detach），201/204 用 `Res`。

**Moment 接入**：
- `MomentEntry.tags: TagEntry[]`（type-only import，对齐 BlobEntry 先例）；`CreateMomentSchema.tags`（default []）、`ListMomentSchema.tag`（additive 可选）、`AddMomentTagSchema`。
- `moment.service.ts`：create 内联 tags 同事务（不存在 → 404 回滚、去重）；list 先查 tag owner 集合再过滤（total 反映过滤后数量，未知 tag → 空）；list/get 内嵌 tags[]（一次 inArray 批查询 + 分组 + momentCount）；delete 事务内先删 tag_relations 再删 moment；`addTag`/`removeTag`/`replaceTags` 薄委托 tagService。
- `moment.router.ts`：`POST/PUT /api/moments/:id/tags`、`DELETE /api/moments/:id/tags/:tagId`。

**接线**：`db/schema.ts` 导出两表；`app.ts` 挂 tagRouter + modules 列表；`exports.ts` 新增 tag 块 + moment 新 schema/类型；`audit.types.ts` 加 `tag.delete`（`audit.domain.ts` 的 `EVENT_MESSAGES` 同步补中文文案，否则 typecheck 报 `Record<AuditEvent,…>` 缺键）。

**迁移**：`bunx drizzle-kit generate --name add_tags`（无需 TTY）→ `drizzle/0010_add_tags.sql` + journal + snapshot 自动生成；已应用本地 PG。

## 验证

- `cd services/api && bun run typecheck` ✅
- `cd services/api && bun test` → **137 pass / 104 skip（RUN_DB_TESTS 门控）/ 0 fail**
- `DATABASE_URL=… RUN_DB_TESTS=1 bun test src/modules/*/*.integration.test.ts` → **88 pass / 0 fail**（含 tag 24 个用例：重名 409、重复绑定 409、PUT 替换幂等/回滚、owner 不存在 404、moment 删除清理关联、删标签级联、`?tag=` 过滤及 total 一致性、内联 tags 回滚）
- 根 `bun run typecheck`（api+mcp+web）✅；根 `bun run test`（mcp 7 + web 151）✅
- 集成测试后 DB 无残留（tags/tag_relations 均为 0 行）

## 对下一次会话的提示（坑）

1. **根目录裸 `bun test` 会跑全仓 68 个文件**，api 的 auth/app 测试因 @/env 首次解析顺序（别的 workspace 先 import 无 AUTH_TOKEN）报 401——这不是回归，`cd services/api && bun test` 与根 `bun run test`（脚本只跑 mcp+web）才是受支持的路径。
2. drizzle 0.45 把驱动错误包在 `DrizzleQueryError.cause` 里，unique/FK 判断必须 unwrap `.cause`（task.service 直接查 `err.code` 是查不到的旧写法，别照抄；blob.domain 的 `isChecksumUniqueConflict` 是正例）。
3. `drizzle-kit generate --name <slug>` 免 TTY 交互，直接出带语义名的迁移文件。
4. domain 注册表放纯校验逻辑、service 模块加载时注册 moment 存在性校验器——注册表在 domain 里保持纯净，只有真实查询在 service（`client as DbClient` 只出现在这一处）。
5. `toMomentEntry` 第 5 个参数 `tags` 有默认值，list 里传 `undefined` 占位 commentCount 参数即可触发默认值。
6. 动态 `import()` 里不能解构 type（`const { type X }` 语法错误），type 用文件顶部静态 `import type`。
7. 给 `AUDIT_EVENTS` 加事件后，`audit.domain.ts` 的 `EVENT_MESSAGES: Record<AuditEvent, string>` 和 `audit.domain.test.ts` 的事件全量断言必须同步，否则 typecheck/单测挂。
