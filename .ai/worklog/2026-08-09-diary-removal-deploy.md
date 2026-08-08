# 2026-08-09 — 日记模块全栈移除 + 生产部署 + DROP diaries 表

延续 08-08 的「日记并入 Moment」：本轮把 diary 模块代码从 api/mcp/cli 全部移除（web/mobile 由并行会话先行完成），推送到 GitHub 触发镜像构建，部署 hpcore，并在生产库执行 `DROP TABLE diaries`。需求：`.ai/requirements/2026-08-08-diary-merge-into-moment.md`；api/mcp 侧细节见同日两个子代理 worklog。

## 执行过程

1. **并行派发 3 个领域 agent**：api-agent（删模块 + `0012_drop_diaries.sql` 迁移 + audit diary.delete 事件 + auth e2e 换 moment）、mcp-agent（删 6 个 diary 工具）、cli-agent（删命令树 + README 整节）。
2. **git 事故与恢复**：api-agent 用 `git stash` 复现测试时恰逢并行 agent 提交，stash 卷走全部未提交工作 → `git fsck` 找回 → 建 `recovery/2026-08-09-stash-sweep` 保护分支 → api 手动恢复、cli 重做、**mcp 的删除被丢失**（工作树恢复原状）。
3. **船长核验**：发现 MCP `diary.tools.ts` 仍在且 exports 已无 diaryService（会编译失败）→ 从 recovery 分支 checkout 回 mcp-agent 的完整删除态（4 文件），grep 确认零残留。
4. **全量验证**：root `bun run typecheck` ✓；api `bun test` 229 用例 0 fail（97 skip 为 DB 门控）；mcp 7 pass；cli `go build/vet/test -count=1` 全绿。
5. **提交推送**：`2e57031 feat!: remove diary module across api, mcp, cli, web, mobile`（46 文件，+1236/−1277），push 触发 docker-publish CI（run 31268109390）。
6. **部署**（hpcore 直连）：`docker pull :main` → digest 与 CI 一致（`34f5aa233f…`）→ tag :latest → `docker compose up -d --force-recreate api` → healthy。
7. **生产库**：`/api/diaries` 返回 404（统一「接口不存在」）→ psql `DROP TABLE IF EXISTS diaries` + `INSERT __drizzle_migrations (hash=251d6cf1…, when=1786207632332)`（现 13 条）。

## 验证

- 容器 healthy；health 200；moments/tags 接口正常
- `to_regclass('diaries')` 返回 NULL（表已不存在）
- 客户端层面：cli 全仓 `rg -i diary` 为空；web/mobile 无 diary 引用

## 坑 / 对下一次会话的提示

1. **多 agent 并行时禁止工作树级 `git stash`/`git reset`**：会卷走其他 agent 的未提交工作。基线对比用 `git worktree`（api-agent 已把教训写进 `.ai/worklog/2026-08-09-api-remove-diary-module.md`）。
2. **事故后必须亲自核验**：agent 报告「已完成」不等于工作树是那个状态（mcp 的删除被 stash 事故洗掉，报告仍显示 7 pass——它测的是洗掉之前的版本）。恢复后重跑全部验证 + grep 残留。
3. 子代理 `git stash push` 时卷走了 `~/.ai/inbox` 等未暂存文件——本次最终都在 recovery 分支里找回；**恢复分支 `recovery/2026-08-09-stash-sweep` 现已无独有内容，可删**。
4. `bun run typecheck` 三包（api+mcp+web）一次跑完最稳；api 的 `bun test` 与 mcp 的 `bun test` 相互独立。
5. 生产迁移记录照旧：stdin 直灌 SQL + `__drizzle_migrations` 手动 INSERT（hash=sha256(整文件)，when=journal 值）。
6. tag 模块测试存在**既有**的注册表跨文件泄漏（全量跑 `RUN_DB_TESTS=1` 集成测试 1 fail，单独跑文件 0 fail）——与本次无关，待修。
