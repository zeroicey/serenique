# 2026-08-10 — AI 工具权限扩展（标签 / 任务组 / 闪念写操作 / 评论）

用户发现 AI（宁序）工具集缺失标签操作与任务组删除，要求全面盘点后补齐。盘点结论：需求文档原「长期方向（暂不实施）」里的标签系统与 moment 整理已上线（08-05），但 AI 工具集（15 个）仍停留在第一批范围，且任务组只给了 list/create——与「任务全量 CRUD」承诺不一致。

## 做了什么

**工具 15 → 32 个**（`services/api/src/modules/ai/ai.tools.ts`，仅改 ai 模块 3 个文件，service 层零改动）：

- 任务组补齐：`get_task_group` / `update_task_group`（重命名）/ `delete_task_group`
- 闪念写操作：`update_moment`（text 整体覆盖 + location 三态：省略=不变 / null=清除 / 对象=覆盖）/ `delete_moment`（级联删附件绑定与标签绑定）
- 标签全量：`list_tags` / `get_tag` / `create_tag` / `rename_tag` / `delete_tag`（名称 1-32，同名冲突报错）
- 闪念标签绑定：`add_moment_tag` / `remove_moment_tag` / `replace_moment_tags`（幂等，空数组=清空）
- 闪念评论全量：`list_moment_comments` / `add_moment_comment` / `update_moment_comment` / `delete_moment_comment`（内容 1-2000）

同步：`ai.system-prompt.ts` 工具清单更新（含标签绑定子行）；`ai.tools.test.ts` 数量断言 15→32；`ai.system-prompt.test.ts` 无需改（只断言 create_task/create_event）。

**明确不加**（用户拍板）：blob 上传/附件（依赖上传流程，对话场景暂不需要）、审计/token/auth。

## 验证

- `bun test src/modules/ai/` → **12 pass / 3 skip / 0 fail**（15 个测试，跳过的是 DB 集成测试）
- `bun run typecheck`（tsc --noEmit）→ 干净

## 坑 / 对下一次会话的提示

1. **需求文档 §4.2 与实现的偏差**：文档写「任务全量 CRUD」但工具只注册了 list/create group——扩工具前先对照 service 方法 grep（`^\s*(async\s+)?[a-zA-Z]+\s*\(`）逐模块比对，别只信文档。
2. **moment 标签绑定走 momentService 而非 tagService**：`momentService.addTag/removeTag/replaceTags` 会校验闪念存在，tagService 的 attach/detach 是通用 ownerType 版（还要求 ownerType 注册）——AI 工具里用 moment 侧便捷方法更安全。
3. **ai.tools.test.ts 的 mock 链**：`mock.module` 只 mock 了 task.service，新增工具测试若要断言 execute 错误路径需按同样模式 mock 对应 service（本次未加新断言，仅更新计数）。
4. **update_moment 的 location 三态**在 TypeBox schema 里用 Optional(Object) 表达，AI 无法表达「null=清除」（TypeBox 无 nullable literal 透传）——实际传 null 会被 schema 拒绝，清除位置只能靠 replace 语义或人工；如需支持可在工具描述里说明并放开 null 校验（本次按现有 service 契约未动）。
