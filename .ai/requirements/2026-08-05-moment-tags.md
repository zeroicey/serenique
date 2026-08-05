# Moment 标签需求文档

- 日期：2026-08-05
- 状态：**方案已确认，待实施**（API 先行；MCP / CLI 后续同步）
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
- 索引：`(owner_type, owner_id)`、`(tag_id)`。
- **owner 实体删除时，关联行由业务模块显式清理**（无 FK 无法 DB 级联；同 moment 删附件先删 blob_attachments 的先例）。

---

## 3. 业务规则

- **创建标签**：name 必填、trim、大小写归一化、唯一；重复 → 409（对齐项目「重复创建 409」先例）。
- **重命名**：PUT 校验唯一性；改名后所有已绑定关系保持（关系挂在 tag_id 上，不受 name 影响）。
- **绑定/解绑**：tag 与 owner 均须存在，否则 404；同一 (tag, owner) 重复绑定 → 409。
- **删除标签**：`ON DELETE CASCADE` 删除其全部关联行（关联表数据不入回收站）。
- **删除 Moment**：moment 模块先清理其 `tag_relations` 行，再删 moment（标签本身保留）。
- 用户可见文案中文（与现有模块一致）。

---

## 4. API 路由（设计方向）

### tags 模块（独立资源）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 标签列表（返回 `momentCount`） |
| POST | `/api/tags` | 创建标签 `{ name }` |
| GET | `/api/tags/:id` | 标签详情（含 `momentCount`） |
| PUT | `/api/tags/:id` | 重命名 `{ name }` |
| DELETE | `/api/tags/:id` | 删除标签（级联删关联） |

### 通用关联（tags 模块，供任意 owner 使用）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tags/:id/attach` | 绑定 `{ ownerType, ownerId }` |
| DELETE | `/api/tags/:id/detach` | 解绑 `{ ownerType, ownerId }` |

### Moment 侧嵌套便捷接口（薄封装，委托 tags 服务）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/moments/:id/tags` | 绑定 `{ tagId }` |
| DELETE | `/api/moments/:id/tags/:tagId` | 解绑 |
| PUT | `/api/moments/:id/tags` | 整体替换 `{ tagIds: [] }` |
| GET | `/api/moments?tag=<tagId>` | 按标签过滤 Moment 列表 |

- 创建 Moment 时允许内联 `tags: [tagId]`（与现有 `attachments` 内联同路径、同事务）。

### 返回结构

- Moment 详情/列表内嵌 `tags[]`（复用「一次 inArray 批查询」模式）。
- 标签列表/详情返回 `momentCount`（当前唯一 ownerType）。

---

## 5. 模块结构与接线点（设计方向）

`src/modules/tag/`：`tag.schema.ts`（两表）/ `tag.types.ts` / `tag.service.ts` / `tag.handler.ts` / `tag.router.ts` / `index.ts`，对齐服务层规范骨架。

- `src/db/schema.ts`：导出 `tags`、`tagRelations`。
- `src/app.ts`：挂载 `tagRouter`，根路由 modules 加 `"tags"`。
- `src/exports.ts`：导出 `tagService`、schemas/类型（供 MCP 消费）。
- moment 模块：返回内嵌 `tags[]`、create 内联 tags、嵌套标签接口、删除时清理关联行。
- MCP / CLI：后续同步（tag CRUD + moment 标签子命令）。

---

## 6. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 模块归属 | **独立 tags 模块**（非 Moment 特有），通用关联表支撑后续内容挂载 |
| ② | 关联表模式 | **多态 ownerType/ownerId**，对齐 blob_attachments |
| ③ | 绑定 API | 单条 attach/detach + 整体替换 PUT |
| ④ | create 内联 | 创建 Moment 允许内联 tags |
| ⑤ | 返回结构 | Moment 内嵌 tags[]；标签返回 momentCount |
| ⑥ | 标签删除 | DB 级联删关联行 |
| ⑦ | 名称约束 | unique + trim + 大小写归一化，≤32 |
| ⑧ | 按标签过滤 | `GET /api/moments?tag=<tagId>` **本次实现**（检索是标签核心用途） |
| ⑨ | 绑定接口形态 | **通用 attach/detach + Moment 嵌套接口都保留**（通用接口服务未来 owner） |
| ⑩ | 重复语义 | 重复创建标签 / 重复绑定 → **409**（对齐项目先例） |
