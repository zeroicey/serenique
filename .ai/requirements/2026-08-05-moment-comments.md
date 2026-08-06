# Moment 评论需求文档

- 日期：2026-08-05
- 状态：**已实施**（2026-08-06；API / MCP / CLI / 前端四端同步完成，见 `.ai/worklog/2026-08-06-moment-comments.md`）
- 范围：`services/api` 新增 Moment 评论（`moment_comments` 表 + 嵌套接口）
- 前置记录：`2026-08-05-service-layer-architecture.md`（分层架构约定）

---

## 1. 背景与目标

发布一些 Moment 后，希望后续能回看**自己给自己的评论**（对某条闪念的补充、备注、回顾）。项目为**个人单用户**使用，评论者只有自己一人。

相比日记模块，本需求简单很多：单一实体、无附件、无多用户概念。

---

## 2. 数据模型（设计方向）

### moment_comments

| 列 | 类型 | 说明 |
|----|------|------|
| id | uuid PK | `defaultRandom()` |
| moment_id | uuid NOT NULL FK → moments.id `ON DELETE CASCADE` | 真外键，删 moment 级联删评论 |
| content | text NOT NULL | ≤ 2000 |
| created_at / updated_at | timestamp | 对齐现有模块 |

- 索引：`moment_id`。
- **不加 author 字段**：单用户场景评论必然是「自己」，YAGNI；未来需要多用户再做迁移。

---

## 3. 业务规则

- **content 必填非空**，≤ 2000 字（评论是对闪念的补充备注，不受闪念 500 字限制）。
- **排序**：`created_at ASC`（时间线正序回看）。
- **不分页**：评论量小，一次返回。
- **更新为部分更新**：PUT + content（对齐项目 PUT 惯例）。
- 删除 Moment → FK `ON DELETE CASCADE` 级联删除评论。
- 用户可见文案中文（与现有模块一致）。

---

## 4. API 路由（设计方向）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/moments/:id/comments` | 评论列表（时间正序） |
| POST | `/api/moments/:id/comments` | 创建评论 `{ content }` |
| PUT | `/api/moments/:id/comments/:commentId` | 更新评论 `{ content }` |
| DELETE | `/api/moments/:id/comments/:commentId` | 删除评论 |

### 返回结构

- Moment **详情内嵌 `comments[]`**（复用「一次 inArray 批查询」模式，与 attachments 同路径）。
- Moment **列表内嵌 `commentCount`**。

---

## 5. 模块结构与接线点（设计方向）

- 评论为 **Moment 子资源**，路由全部嵌套在 `/api/moments/:id/comments` 下。
- 实现归属：**并入 moment 模块**（已确认）——在 `src/modules/moment/` 内新增 `comment.schema.ts` / `comment.types.ts` / `comment.service.ts` 等文件，评论操作作为 momentService 的职责，不新建独立模块（评论强绑定 moment）。
- `src/db/schema.ts`：导出 `momentComments`。
- `src/exports.ts`：导出评论相关 service 方法与类型（供 MCP 消费）。
- moment 模块：详情加载 comments[]、列表加载 commentCount、删除时靠 FK 级联。
- MCP / CLI：后续同步（评论 CRUD）。

---

## 6. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| ① | 实体归属 | 评论是 Moment 子资源，嵌套路由 |
| ② | author 字段 | **不加**（单用户，YAGNI） |
| ③ | 内容上限 | ≤ 2000 |
| ④ | 排序 | `created_at ASC` |
| ⑤ | 分页 | 不分页 |
| ⑥ | 级联删除 | `moment_id` FK `ON DELETE CASCADE` |
| ⑦ | 返回结构 | 详情内嵌 comments[]；列表内嵌 commentCount |
| ⑧ | 实现归属 | **并入 moment 模块**（评论强绑定 moment，不新建独立模块） |
