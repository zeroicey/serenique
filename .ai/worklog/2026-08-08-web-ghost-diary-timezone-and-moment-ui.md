# 2026-08-08 — Web：幽灵 8/8 日记根因修复 + Moment 评论/UI 对齐移动端

本轮为 Web 前端（`apps/web`）改动。注：队长派单里写的仓库路径是 `serenique-test/apps/web`，
但实测该仓库是旧项目（无日记模块），本仓库设计文档也明确 `serenique-test` 为「旧项目，仅做风格参考」。
实际 Web 代码在 `/Users/zeroicey/workspace/projects/serenique/apps/web`，改动都在这里；未动 `apps/mobile`。

## 1. 幽灵 8/8 日记（最高优先级）

### 现象
8/8 凌晨 2 点多（本地 UTC+8），用户在 Web 补写 8/7 日记，提交成功（8/7 确实更新），
但前端刷新后「出现一篇 8/8 的日记」；用户查接口没有 8/8。移动端无此问题。

### 系统化调试
- 读 web diary 全部代码：`useDiaries` 全量拉取+倒序、`useDiaryByDate(date)` 按 key 缓存、
  三个 mutation 成功后 `invalidateQueries(['diaries'])` + `['diary','by-date']`。**无乐观更新、无自动建日记逻辑**，缓存/refetch/query key 没有错。
- 关键差异：**Web「今天」用 `todayUTC()`（`new Date().toISOString().slice(0,10)`，UTC 日期）；移动端用本地日期**（`DateFormat('yyyy-MM-dd').format(DateTime.now())`）。
- 用 `vi.setSystemTime('2026-08-07T18:00:00Z')` 实证：本地 8/8 02:00（UTC+8）时，`todayUTC()` 返回 `2026-08-07`，`todayLocal()` 返回 `2026-08-08`。
- 追踪数据流：8/8 凌晨 Web 的「今天卡片」= `useDiaryByDate('2026-08-07')`。用户补写 8/7 后 invalidate + 刷新，
  **今天卡片把 8/7 日记展示为「今天」**。用户本地「今天」是 8/8，于是这张卡片被读成「一篇 8/8 的日记」，
  但接口里只有 8/7 → 幽灵。移动端「今天」= 本地 8/8，不存在这个偏差。

### 根因（一句话）
Web 日记模块用 UTC 日期判定「今天」，凌晨时段（本地日期比 UTC 早一天）时「今天卡片」展示的是昨天（8/7）的日记，
被用户理解为「8/8 幽灵日记」；移动端用本地日期所以没这个问题。

### 修复
把日记模块「今天」口径从 UTC 改为**本地日期**（对齐移动端）：
- `lib/date.ts`：保留 `todayUTC`，日记模块改用它处已有的 `todayLocal()`。
- `diary-today-card.tsx`：`today = todayLocal()`。
- `diary-item.tsx`：`isToday` 用 `todayLocal()`；⋮ 菜单新增「编辑」→ `/diary/write?date=<diaryDate>`（否则「今天」改为本地后，时间线没有补写入口，回归）。
- `diary-create-page.tsx`：默认日期 `todayLocal()`。
- `diary/schemas.ts`：未来日期校验改 `todayLocal()`（与用户「今天」一致）。
- 测试：`schemas.test.ts`/`diary-item.test.tsx`/`diary-today-card.test.tsx` 同步改本地日期口径；新增回归断言「今天卡片按本地日期查询」与「⋮ 菜单编辑跳转」。

### 遗留（需 API Agent 跟进）
后端 `services/api/src/modules/diary/diary.domain.ts todayStr()` 仍用 UTC 判定未来日。
在本地 00:00–08:00（UTC+8）期间，用户为本地「今天」（如 8/8）创建日记时，前端 schema 放行但后端会以
「不能创建未来日期的日记」拒绝。Web 侧已按本地口径修复幽灵问题；后端如要对齐，建议 `todayStr()`/`isFutureDate`
改为接收客户端时区或放宽为「仅拒绝明显未来（> UTC 今天 +1 天）」——由队长派 API Agent 处理。

## 2. Moment 评论头像与移动端对齐

- 重写 `features/moment/components/moment-comment-list.tsx`：每条评论加 DiceBear 像素头像
  （`https://api.dicebear.com/7.x/pixel-art/svg?seed=<评论id>`，24px，`float-left mr-2 rounded-full`）。
  利用 CSS `float` 让正文首行让位给头像、**换行后顶到最左边环绕**（父级 `flow-root` 防 float 逃逸，
  时间 `clear-left` 顶格），与移动端 `CommentRow` 行为一致，不再「头像固定一列 + 文字右列」。
- 新增 `moment-comment-list.test.tsx`：断言头像 seed=评论 id、float 布局、只读。

## 3. Moment UI 调整

- **屏幕适配**：`moment-item` 根容器加 `px-3`，平板及以下宽度正文不再贴屏幕两边。
- **评论删除按钮**：移除每条评论的删除按钮（列表内联 + 「查看全部」对话框都去掉 `onDelete`），
  `useDeleteMomentComment` hook 保留在 queries（API 契约仍在，组件不再使用）。删除入口方案待用户选择（见下方）。
- **全文/收起**：从时间行移到**正文下方**（`全文`/`收起` 文字链接，蓝色 hover 下划线，与「查看全部评论」同风格），时间行只留时间 + ⋮ 菜单，与移动端一致。

### 评论删除入口方案（供用户选择，暂未实现）
1. **长按评论弹层**（微信风格，对齐移动端 `comment_section.dart`）：信息流长按某条评论弹出底部弹层「删除/取消」。
2. **Moment 卡片 ⋮ 菜单**：在闪念的 ⋮ 菜单里加「删除评论」，进入后勾选/点选要删的评论（信息流仍只读）。
3. **暂不提供删除**：评论不可删，保持最简；后续做详情页时再一并提供。

## 测试与验证

- `bun run typecheck` ✅
- `TZ=Asia/Shanghai bun run test`：36 files / 131 tests 全绿 ✅
- `bun run build` ✅

## 对下一次会话的提示
- 测试 Base UI `@base-ui/react/menu`（dropdown）浮层需在 `src/test/setup.ts` 补 `ResizeObserver` 与
  `Element.prototype.getBoundingClientRect` mock，否则菜单在 jsdom 打不开（已补）。
- 幽灵 8/8 的复现要点：`vi.setSystemTime('2026-08-07T18:00:00Z')`（= 8/8 02:00 UTC+8）时，
  `todayUTC()='2026-08-07'` 而 `todayLocal()='2026-08-08'`。
