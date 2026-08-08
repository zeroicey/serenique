# Moment 标签需求文档

- 日期：2026-08-05（2026-08-08 复审修订：补 owner 校验机制、PUT 替换语义、测试/审计/MCP/CLI 接线）
- 状态：✅已实施（2026-08-08 API + CLI 落地，验证全绿；MCP 经 `.extend()` 自动流入）
- 范围：`services/api` 新增独立 **tags 模块**（标签 + 通用关联），Moment 接入
- 前置记录：`2026-08-05-service-layer-architecture.md`（分层架构约定）

---

## 1. 背景与目标

Moment（闪念）当前为纯文本 + 附件。新增**标签**概念用于分类组织，方便回看与检索。

**已确认的关键方向**：标签是**独立资源 / 独立模块**，不是 Moment 特有资源。通过**通用关联表**可挂载到任意业务内容——当前唯一接入方为 Moment，后续可扩展 diary / event / task 等。设计对齐项目已有 `blob_attachments` 的 `ownerType/ownerId` 多态关联模式。

---

## 2. 数据模型（设计方向）

### tags（标签表，独立于业务模块）

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid PK | `defaultRandom()` |
| name | text NOT NULL **UNIQUE** | 创建/更新时归一化（trim + 大小写归一化为小写），长度 ≤ 32 |
| created_at / updated_at | timestamp | 对齐现有模块 |

### tag_relations（通用关联表，多态 owner）

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid PK | `defaultRandom()` |
| tag_id | uuid NOT NULL FK → tags.id `ON DELETE CASCADE` | 删标签连带删关联行 |
| owner_type | text NOT NULL | 如 `"moment"`；后续可 `"diary"` / `"event"` / `"task"` |
| owner_id | text NOT NULL | 业务实体 id；**无 FK**（多态 owner 无法建外键，对齐 blob_attachments） |
| created_at | timestamp | |

- 唯一约束 `(tag_id, owner_type, owner_id)`：同一标签对同一 owner 只绑定一次。
- 索引：仅 `(owner_type, owner_id)`。**不建 `(tag_id)` 单独索引**——唯一约束生成的最左前缀已覆盖（无 blob_id 单独索引是合理的，因为 blob_attachments 没有以 blob_id 开头的唯一约束）。
- **owner 实体删除时，关联行由业务模块显式清理**（无 FK 无法 DB 级联；同 moment 删附件先删 blob_attachments 的先例）。

### 名称校验分层

- **trim + 长度（≤32）放 Zod**（`tag.types.ts`，对齐 event.types.ts 的 `z.string().trim().min(1).max(...)` 惯例，MCP `.extend()` 自动继承校验）。
- **小写归一化放 `tag.domain.ts` 纯函数**（毫秒级单测；中文标签无大小写概念，归一化是 no-op）。
- **DB unique 兜底**。注意显示影响：归一化后存储名即显示名（"Work" 存为 "work"），显示层丢失原始大小写——已确认可接受。
- **并发竞态**：同名标签并发创建/重命名会命中 DB unique 约束，service 层必须捕获 unique violation 并转 `AppError(ErrorCode.CONFLICT, …, 409)`，否则落 500。

---

## 3. 业务规则

- **创建标签**：name 必填、trim、大小写归一化、唯一；重复 → 409。错误码用 **`ErrorCode.CONFLICT`**（勿照抄 diary 重复日期的 VALIDATION code 反例）。并发竞态命中 DB unique 时同样转 409。
- **重命名**：PUT 校验唯一性（含竞态转 409）；改名后所有已绑定关系保持（关系挂在 tag_id 上，不受 name 影响）。
- **单条 attach**：tag 与 owner 均须存在，否则 404；同一 (tag, owner) 重复绑定 → **409**。
- **owner 存在性校验机制（ownerType 注册表）**：通用 attach/detach 接口通过 **ownerType 注册表**（当前仅 `"moment"`，对齐 `MOMENT_ATTACHMENT_OWNER_TYPE` 常量模式）校验 ownerType 合法性，并为每种注册类型提供**存在性校验器**（moment 类型查 moments 表；后续 diary/event/task 逐个注册）。注册表同时防 ownerType 拼写垃圾数据。
- **PUT 整体替换（幂等集合语义）**：`{ tagIds: [] }` 与现有绑定做差集——**容忍已绑定标签**（结果一致即成功，不抛 409），仅对**不存在的 tagId → 404**，全量校验失败整体事务回滚；**空数组 = 清空全部**；数组内重复 tagId 去重（对齐 moment `uniqueBlobIds` 先例）。返回替换后的新 `tags[]`。
- **创建 Moment 内联 tags**：不存在的 tagId → 404（对齐「tag 须存在」）；数组内重复去重（集合语义不应 409）；与主行、attachments **同事务**。
- **删除标签**：`ON DELETE CASCADE` 删除其全部关联行（关联表数据不入回收站）。
- **删除 Moment**：moment 模块先清理其 `tag_relations` 行，再删 moment（标签本身保留）。接线点：`moment.service.ts` 的 `delete()` 事务内、删 blobAttachments 之后（现有模式），同事务。
- 用户可见文案中文（与现有模块一致）。

---

## 4. API 路由（设计方向）

### tags 模块（独立资源）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 标签列表（返回 `{ items, total }`，每项含 `momentCount`） |
| POST | `/api/tags` | 创建标签 `{ name }`（201 + TagEntry） |
| GET | `/api/tags/:id` | 标签详情（含 `momentCount`） |
| PUT | `/api/tags/:id` | 重命名 `{ name }`（返回 TagEntry） |
| DELETE | `/api/tags/:id` | 删除标签（级联删关联；204） |

### 通用关联（tags 模块，供任意 owner 使用）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tags/:id/attach` | 绑定 `{ ownerType, ownerId }`（201 + relation entry；重复 → 409） |
| DELETE | `/api/tags/:id/detach` | 解绑 `{ ownerType, ownerId }`（204；不存在 → 404） |

### Moment 侧嵌套便捷接口（薄封装，委托 tags 服务）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/moments/:id/tags` | 绑定 `{ tagId }`（201；重复 → 409） |
| DELETE | `/api/moments/:id/tags/:tagId` | 解绑（204） |
| PUT | `/api/moments/:id/tags` | 整体替换 `{ tagIds: [] }`（幂等集合语义；返回新 `tags[]`） |
| GET | `/api/moments?tag=<tagId>` | 按标签过滤 Moment 列表（ListMomentSchema 加 additive 可选字段 `tag`，兼容现有 page/pageSize） |

- 创建 Moment 时允许内联 `tags: [tagId]`（与现有 `attachments` 内联同路径、同事务）。

### 返回结构

- Moment 详情/列表内嵌 `tags[]`（复用「一次 inArray 批查询」模式）；`MomentEntry` 类型新增 `tags: TagEntry[]` 字段（跨模块 type-only import，对齐现有 import BlobEntry 先例）。
- 标签列表/详情返回 `momentCount`（当前唯一 ownerType）。

---

## 5. 模块结构与接线点（设计方向）

`src/modules/tag/`（补全清单，对齐服务层规范 6 核心 + 2 扩展 + 2 测试）：

| 文件 | 职责 |
|------|------|
| `tag.schema.ts` | 两表 Drizzle 定义（tags / tag_relations） |
| `tag.types.ts` | Zod schema（Create/Rename/List/Attach/Detach/ReplaceTags）+ TagEntry 类型 |
| `tag.domain.ts` | 纯函数：name 归一化、ownerType 注册表、重复 id 去重 |
| `tag.mappers.ts` | row → TagEntry 转换（含 momentCount 计算） |
| `tag.service.ts` | 单例 `tagService`，编排 + unique violation → 409 转换 |
| `tag.handler.ts` | parse → service → `Res`，共享 `handleError` |
| `tag.router.ts` / `index.ts` | Hono 路由 / barrel |
| `tag.service.test.ts` | domain 纯函数 + Zod schema + mappers（无 DB） |
| `tag.service.integration.test.ts` | 真 PG（`RUN_DB_TESTS=1` 门控，RUN_TOKEN 前缀幂等） |

接线点：

- `src/db/schema.ts`：导出 `tags`、`tagRelations`。
- `src/app.ts`：挂载 `tagRouter`，根路由 modules 加 `"tags"`。
- `src/exports.ts`：导出 `tagService` + `CreateTagSchema`/`RenameTagSchema`/`ListTagSchema`/`AttachTagSchema`/`DetachTagSchema`/`ReplaceTagsSchema` + `TagEntry`/关联类型；`MomentEntry` 新增 `tags` 字段为 additive 改动，不影响既有 MCP `.extend()`/`.shape` 契约。
- moment 模块：返回内嵌 `tags[]`、create 内联 tags、嵌套标签接口、`?tag=` 过滤、删除时同事务清理关联行。
- **审计**：`audit.types.ts` 的 `AUDIT_EVENTS` 枚举加 `tag.delete`（对齐「所有删除都审计」惯例，单一事实源）；绑定/解绑/重命名**不审计**（对齐 addAttachment 先例）。
- **MCP：本次无需改代码**——`list_moments`/`create_moment` 工具经 `ListMomentSchema.extend()` / `CreateMomentSchema.extend()` **自动获得** `tag` 过滤参数与内联 `tags` 字段。
- **CLI**：`internal/client/moment.go` 的 `MomentEntry` **同步新增 `Tags []TagEntry`** 字段（json tag 与 API 同批落地，保住 `--json` round-trip 契约；Go 解码静默丢弃未知字段）；完整 tag 子命令（`internal/client/tag.go` + `cmd/tag.go` + root.go 注册）**本次实现**。

---

## 6. 测试要点（服务层规范强制两层）

- **`tag.service.test.ts`（无 DB）**：name 归一化（trim/小写/空串）、重复 tagId 去重、ownerType 注册表校验、Zod schema 边界（≤32、uuid）。
- **`tag.service.integration.test.ts`（真 PG）**：创建/重名 409、并发竞态 unique 转 409、重复绑定 409、PUT 替换（容忍已绑定/空数组清空/不存在 404/回滚）、attach 时 owner 不存在 404、moment 删除清理 tag_relations、删标签级联删关联、`?tag=` 过滤及 count 一致性。

---

## 7. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 模块归属 | **独立 tags 模块**（非 Moment 特有），通用关联表支撑后续内容挂载 |
| ② | 关联表模式 | **多态 ownerType/ownerId**，对齐 blob_attachments |
| ③ | 绑定 API | 单条 attach/detach + 整体替换 PUT |
| ④ | create 内联 | 创建 Moment 允许内联 tags |
| ⑤ | 返回结构 | Moment 内嵌 tags[]；标签返回 momentCount |
| ⑥ | 标签删除 | DB 级联删关联行 |
| ⑦ | 名称约束 | unique + trim + 大小写归一化，≤32；trim/长度在 Zod、归一化在 domain、DB unique 兜底 |
| ⑧ | 按标签过滤 | `GET /api/moments?tag=<tagId>` **本次实现**（检索是标签核心用途） |
| ⑨ | 绑定接口形态 | **通用 attach/detach + Moment 嵌套接口都保留**（通用接口服务未来 owner） |
| ⑩ | 重复语义 | **单条 attach 重复绑定 → 409**（对齐项目先例）；**PUT 整体替换容忍已绑定（幂等集合语义）**，仅不存在 tagId → 404 |
| ⑪ | owner 校验 | **ownerType 注册表 + 每类型存在性校验器**（当前仅 "moment"），防拼写垃圾数据 |
| ⑫ | 竞态处理 | unique violation 捕获转 `ErrorCode.CONFLICT` 409（创建/重命名） |
| ⑬ | 审计 | `AUDIT_EVENTS` 加 `tag.delete`；绑定/解绑/重命名不审计 |
| ⑭ | MCP | 经 `.extend()` 自动流入 `tag`/`tags` 参数，**无需改 MCP 代码** |
| ⑮ | CLI | `MomentEntry.Tags` 结构字段本次同步落地；完整 tag 子命令本次实现 |
| ⑯ | 索引 | 仅 `(owner_type, owner_id)` 索引；不建 `(tag_id)`（唯一约束最左前缀已覆盖） |
| ⑰ | 测试 | 两层测试：domain/schema/mappers 单测 + 真 PG 集成测试 |
