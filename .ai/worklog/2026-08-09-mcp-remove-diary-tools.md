# 2026-08-09 — MCP 移除 diary 工具（日记模块并入 Moment）

按 `.ai/requirements/2026-08-08-diary-merge-into-moment.md` §3，日记模块从 `@serenique/api` 移除后，MCP 的 diary 工具（依赖 `diaryService`/diary schemas）会编译失败，本次先行同步删除 MCP 工具面。数据迁移已于 08-08 完成（43 条 → Moments + 「日记」标签）。

## 改动（未提交，等船长统一收尾）

- **services/mcp**：删除 `src/tools/diary.tools.ts`（create_diary / list_diaries / get_diary / get_diary_by_date / update_diary / delete_diary 六个工具）
- **services/mcp**：`src/tools/index.ts` 删 `export { registerDiaryTools }`
- **services/mcp**：`src/server.ts` 删 import 与 `registerDiaryTools(server)` 调用
- **services/mcp**：`src/app.test.ts` 工具清单断言删 6 个 diary 工具名

## 验证

- `cd services/mcp && bun test`：**7 pass, 0 fail**（app.test.ts 4 个 + upload-blob-url.test.ts 3 个）
- `grep -ri diary services/mcp` 无残留引用
- 此时 `@serenique/api` 的 diary 移除尚未合入工作区，exports.ts 仍导出 diaryService，MCP 侧已先行删净；typecheck 由船长在 API 侧移除完成后统一跑

## 坑 / 对下一次会话的提示

- 任务描述里的工具名写的是 `list_diary`，实际 MCP 工具名是 **`list_diaries`**（与 API 路由 `/api/diaries` 一致），删除测试断言时按实际名称
- API 侧 diary 移除落地后：`grep -ri diary services/mcp apps/cli apps/web` 复核其余端残留
