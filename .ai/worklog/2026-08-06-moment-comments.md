# 2026-08-06 — Moment 评论功能实施（API / MCP / CLI / 前端四端）

按 `.ai/requirements/2026-08-05-moment-comments.md` 实施，四端同步完成并验证。API 由主线程完成，MCP / CLI / 前端并行派发子代理完成。

## 本次完成

**API 服务（services/api）**
- 新增 `src/modules/moment/comment.schema.ts`（`moment_comments` 表：uuid PK、`moment_id` FK `ON DELETE CASCADE`、`content` ≤2000、`idx_moment_comments_moment_id` 索引）。
- 新增 `comment.types.ts`（`Create/UpdateMomentCommentSchema` content 1..2000；`MomentCommentEntry` 等）、`comment.mappers.ts`（`toMomentCommentEntry` + `groupCommentsByMomentId`，纯函数）、`comment.service.ts`（`momentCommentService.list/add/update/remove` + 两个批查询 helper `listCommentsByMomentIds` / `listCommentCountsByMomentIds`）。
- 评论并入 moment 模块（决策⑧）：路由嵌套在 `moment.router.ts` 的 `/api/moments/:id/comments` 下，handler 进 `moment.handler.ts`。
- Moment 详情内嵌 `comments[]`、列表内嵌 `commentCount`（决策⑦）：`moment.service.ts` 的 get 用一次 inArray 批查询加载评论、list 用 `count(*) group by moment_id` 批计数，与附件加载并行，无 N+1。
- `db/schema.ts` / `exports.ts` 导出 `momentComments`、`momentCommentService` 及评论类型与 schema（供 MCP 消费）。
- 迁移 `drizzle/0008_bitter_living_mummy.sql`（表 + 级联 FK + 索引，单一文件）。

**MCP（services/mcp）** — 子代理完成
- `moment.tools.ts` 新增 `list_moment_comments` / `create_moment_comment` / `update_moment_comment` / `delete_moment_comment` 4 个工具，消费 `momentCommentService`，输入 schema 字段与 service 入参一致（`momentId`/`commentId`），中文描述。
- `app.test.ts` 工具清单用例同步 4 个新名字。

**CLI（apps/cli）** — 子代理完成
- 新增 `cmd/moment_comment.go`：`serenique moment comment list/add/update/delete` 子命令，挂在 `moment comment` 下。
- `MomentEntry` 结构体补 `Comments` / `CommentCount`；新增 `MomentCommentEntry`。`moment list` 加"评论"列，`moment get` 打印评论表格。
- 新增 `cmd/moment_test.go`（9 个测试）。

**前端（apps/web）** — 子代理完成
- `api.ts` 补 `MomentEntry.comments`/`commentCount` + `MomentCommentEntry` + `listMomentComments` / `createMomentComment` / `deleteMomentComment`。
- `queries.ts` 新增 `useMomentComments`（惰性 enabled）、`useCreateMomentComment`、`useDeleteMomentComment`；成功后 invalidate `['moment-comments', momentId]` 与 `['moments']`。
- 新增 `moment-comment-list.tsx`、`moment-comments-dialog.tsx`；`moment-item.tsx` 内联前 3 条评论 + 「查看全部 N 条评论」对话框 + 评论输入（Enter/发送）+ 删除评论 + 顶部「N 条评论」开关。
- 补 `queries.test.tsx` / `moment-item.test.tsx` 用例。

**文档**：CLAUDE.md API 路由表 + moment 模块描述同步；需求文档状态改为「已实施」。

## 验证

- API：`bun run typecheck` ✓；单元测试 82 pass ✓（新增评论 schema/mapper/grouping 4 条 + toMomentEntry 1 条）；`test:integration:full` 51 pass ✓（含评论 CRUD、级联删除、404、commentCount、时间正序）。
- 端到端 HTTP 冒烟（createApp + app.request 直连测试库）：POST 201 / GET 列表 200 / GET 详情带 commentCount=1 / PUT 200 / DELETE 204 / DELETE moment 204（级联）/ 缺失 moment 404，全部符合预期。
- MCP：`bun run --cwd services/mcp test` 6 pass ✓。
- CLI：`go build ./... && go vet ./... && go test -count=1 ./...` 全绿 ✓。
- 前端：`bun run typecheck` ✓、`bun run test`（vitest，24 文件 77 用例）✓、`bun run lint`（0 error，5 warning 为改动前已存在的 RHF watch 提示）✓、`bun run build` ✓。
- 根 `bun run typecheck`（api + mcp + web）✓。

## 对下一次会话的提示（pitfalls）

1. **CLI 的 `-c` 短 flag 已被 `--config` 占用**：根命令有 persistent `--config/-c`，任何子命令再用 `-c` 会在 flag 合并时直接 panic（`unable to redefine 'c' shorthand`）。内容类 flag 沿用 diary/moment create 的 `-m` 约定（`--content/-m`）。
2. **drizzle-kit generate 对新增列/索引的处理**：给新表加索引要写进 schema 的 `pgTable(..., (t) => [index(...)])` 第三参数，FK 不会自动带索引。若想生成单一迁移，可在重新 generate 前手动删掉上次生成的 `.sql`、`meta/<tag>_snapshot.json` 并摘掉 `_journal.json` 对应条目（本次用 python 脚本处理）。
3. **MCP 新增工具必须同步 `app.test.ts` 的工具名清单用例**（sorted 数组），否则 MCP 测试挂。
4. **评论列表接口返回普通数组**（非分页信封），CLI 的 `moment comment list` 直接 `apiClient.Get` 解码 `[]MomentCommentEntry`，别套 `client.List` 泛型（那是给 `{items,total}` 信封的）。
5. **根目录 `bun test` 会把 apps/web 的 vitest 用例带进来并失败**（jsdom 环境不匹配）。正确姿势：`bun run --cwd services/mcp test`（MCP）与 `bun run --cwd apps/web test`（vitest）分开跑；`bun run --cwd apps/web test` = vitest，不是 `bun test`。
6. **前端列表接口的 `comments` 恒为 `[]`**（只有数量），卡片用 `moment.commentCount > 0` 作为 `useMomentComments` 的 enabled 条件惰性拉取评论体，对话框与内联列表复用同一份 query 数据。
7. 工作区有**先前会话遗留的 task 前端功能未提交改动**（`apps/web/src/features/task/*`、`router.tsx`、`app-sidebar.tsx`、`.ai/worklog/2026-08-06-task-web-feature.md`），与本次评论功能无关，提交时注意区分。
