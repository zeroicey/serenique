# 2026-08-08 — Moment 编辑功能（API + 移动端）+ 详情页底部安全距离

给闪念（moment）补上编辑能力：API 新增 `PUT /api/moments/:id`，移动端详情页改为「正文可直接编辑 + 右上角保存」（对齐日记编辑页模式）；同时修复详情页评论区在曲面屏上贴底的问题。

> MCP 已停更停用（`.ai/decisions/2026-08-08-mcp-sunset.md`）：最初给 `services/mcp` 加的 `update_moment` 工具已回滚，代码冻结不提交。

## API（services/api）

- `moment.types.ts`：新增 `UpdateMomentSchema`（`text` 1-500，唯一可改字段）+ `UpdateMomentBody` / `UpdateMomentInput`（`{ id } & body`）。
- `moment.service.ts`：新增 `momentService.update()`——更新 `text`（显式 `updatedAt: new Date()`），复用 `get()` 返回带评论/附件的完整 entry；不存在抛 `AppError NOT_FOUND`（「闪念不存在」）。不触发 audit（与 diary.update 一致）。
- `moment.handler.ts` + `moment.router.ts`：`PUT /api/moments/:id`，成功响应 `Res.ok("闪念更新成功", entry)`。
- `exports.ts`：导出 `UpdateMomentSchema` + `UpdateMomentInput`。
- 测试：`moment.service.test.ts` 加 schema 用例（1-500 字、拒绝 `content` 字段）；`moment.service.integration.test.ts` 加 2 个用例（更新后 text/updatedAt/comments 正确；不存在 id 抛错）。

## 移动端（apps/mobile）

- `moment_api.dart`：`MomentApi.update(id, text)` → `PUT /api/moments/:id`。
- `moment_providers.dart`：`MomentActions.update()`——成功后 invalidate 详情 + 列表。
- `moment_detail_page.dart` 重构（ConsumerStatefulWidget）：
  - 正文从只读 `Text` 改为**无边框 `TextField`（minLines 1 / maxLines null）直接可编辑**，进入页面即改、不弹键盘（无 autofocus）。
  - 右上角加**保存按钮（check 图标，保存中转 spinner）**，与日记编辑页同款；保留删除按钮。
  - 保存：trim 空 → SnackBar「内容不能为空」；成功 → pop 返回列表。
  - **底部安全距离**：body 用 `SafeArea(top: false, minimum: EdgeInsets.only(bottom: 12))` 包住 ListView——评论区输入框不再贴曲面屏/手势条底边（viewPadding.bottom + 12 保底）。
- 测试 `moment_detail_page_test.dart` 重写：显示/可编辑断言（页面共 2 个 TextField：正文 + 评论输入）、保存流（update 被调用 + GoRouter push 后 pop 回「列表页」）、空内容拦截、删除确认流、长按删评论、**曲面屏安全距离**（`FakeViewPadding(bottom: 34)` 下断言发送按钮 bottom ≤ 600-34）。

## 验证

- `flutter analyze` → No issues；`flutter test` → **91/91 PASS**（原 85 + 详情页新增/改写）。
- `bun run typecheck`（api+mcp）→ 通过。
- `cd services/api && bun test` → **122 pass / 0 fail**（78 skip = RUN_DB_TESTS 门控；集成测试未跑，需起 test DB——update 复用 get 的既有路径，风险低）。
- `cd services/mcp && bun test` → 7 pass / 0 fail（回滚后未跑，代码已恢复原状）。

## 对下一次会话的提示

- 集成测试里 `momentService.update()` 会先 `UPDATE` 再走 `get()` 拼评论/附件——DB 集成用例若想验证，需 `RUN_DB_TESTS=1`（本机未起 test DB）。
- 详情页现在有两个 TextField（正文 + 评论输入框），widget 测试里定位正文用 `find.byType(TextField).first`。
- 移动端详情页保存/删除的 pop 验证需要 GoRouter 包一层（`MaterialApp.router` + 从 `/home` push `/detail`），纯 `MaterialApp(home:)` 下 `context.pop()` 会抛「Nothing to pop」。
