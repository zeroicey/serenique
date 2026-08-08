# 2026-08-09 — API 移除 diary 模块（日记并入 Moment 收尾）

按 `.ai/requirements/2026-08-08-diary-merge-into-moment.md` §3，在 `services/api` 内彻底移除 diary 模块（数据迁移已于 08-08 完成）。MCP 工具面由 mcp-agent 同日先行删除（见 `2026-08-09-mcp-remove-diary-tools.md`），CLI/Web/移动端由各自 agent 处理。

## 改动

- 删除 `src/modules/diary/` 全部 10 个文件（schema/types/domain/mappers/service/handler/router/index + service.test/integration.test）
- `src/db/schema.ts`：删 `export { diaries }`（Drizzle Kit 注册表唯一入口）
- `src/app.ts`：删 diaryRouter import / `app.route("/api", diaryRouter)` / `/` 响应 modules 列表里的 "diary"
- `src/exports.ts`：删 Diary module 块（diaryService、7 个类型、4 个 schema）——**MCP 依赖此面，改动前已确认 MCP 侧同步删净**
- `src/test/helpers.ts`：删 diaries import + `fakeDiaryRow`（唯一引用在已删除的 diary.service.test.ts 内）
- `src/modules/auth/auth.service.integration.test.ts`：diary API → moment API（401 用例 + 带 Cookie 建资源 e2e；moment 无唯一性约束，用唯一文本 + finally 按 id 清理，比 diary 的固定日期方案更稳）
- audit 模块：`AUDIT_EVENTS`/`EVENT_MESSAGES` 删 `diary.delete`；`audit.domain.test.ts` 事件清单断言、`audit.service.test.ts` 最小 record 用例、`audit.service.integration.test.ts` 的 record 断言 + 401 去重用例的 `/api/diaries` 路径全部换 moment
- `src/app.test.ts`：注释 "Regression for the diary/blob handlers" → moment/blob；malformed-JSON 用例的 POST 目标 `/api/diaries` → `/api/moments`；badRequests 列表删 `/api/diaries/not-a-uuid` 条目（路由已不存在，否则 404 而非 400 会挂测试）
- **迁移**：`drizzle/0012_drop_diaries.sql` = `DROP TABLE "diaries" CASCADE;`（journal idx 12 + snapshot 已生成，未应用本地库）

## 验证（services/api 内）

- `bun run typecheck`：通过
- `bun test`：**132 pass / 97 skip / 0 fail**（229 tests, 23 files）
- `RUN_DB_TESTS=1 bun test`：**214 pass / 1 fail** —— 唯一失败 `tag service DB integration > attach to a missing owner rejects 404; unregistered ownerType rejects 400` 是**既有问题**：`tag.service.test.ts` 的注册表用例 `registerOwnerValidator("diary", async () => {})` 把 no-op validator 注册进模块级 Map，全量跑时污染集成测试进程（单独跑该集成文件 24 pass / 0 fail）。用 `git stash` 回 HEAD 基线复跑确认：改动前同样失败（230 pass / 1 fail）。与本次 diary 移除无关，未动 tag 测试（任务明确要求保留其泛化字符串）。

## 坑 / 对下一次会话的提示（重要）

1. **并行 agent 会话 + git stash = 高危组合**。本次为了跑 HEAD 基线复现 tag 测试失败，执行 `git stash push`，结果 stash 把工作树里**其他 agent 的未提交改动**（CLI diary 删除、MCP diary 工具删除、文档改动）一并卷走；随后 `git stash pop` 冲突 + 并行 agent 的 `git reset` 把工作树清回 HEAD，我的 services/api 改动全部消失。恢复路径：`git fsck --no-reflogs --unreachable` 找到 stash commit（`On main: diary-removal-wip`），`git branch recovery/2026-08-09-stash-sweep <sha>` 保命，`git checkout <branch> -- services/api` 恢复我的子树，`git rm -r` 补删目录。**教训：多 agent 并行开发时不要对工作树做 stash/reset/checkout 类全局操作；需要基线对比时用 worktree（`git worktree add`）或先 commit，绝不用 stash。**
2. `git checkout <commit> -- <dir>` 只恢复该 commit 树里**存在**的路径，commit 树里被删除的跟踪文件不会自动从工作树移除——需手动 `git rm -r`。
3. 删除模块后 `app.test.ts` 这类「只改注释」的任务往往暗藏路由引用（malformed JSON 用例 POST `/api/diaries`、UUID 校验列表），必须 grep 全文件再动手。
4. tag 注册表跨文件泄漏（坑 1 前的既有问题）：若要修，把 `tag.service.test.ts` 注册表用例改成用一次性 ownerType（如 `"test-owner"`）并在用例内清理注册，或测试后 `registerOwnerValidator` 无法注销——需要给 registry 加测试专用 reset。可留作后续技术债。
5. 迁移未应用本地库（任务要求）；下次 `bunx drizzle-kit push` 或 `db:migrate` 时 `0012_drop_diaries.sql` 会真正 DROP 表，生产库需先确认 moments 数据完整。
