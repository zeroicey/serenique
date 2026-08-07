# 2026-08-07 — Web Moment/日记「展开/收起」改图标样式（纯 Web）

移动端已把 Moment 做成朋友圈样式；外部端 Web 的展开/收起原本是纯文字按钮（「展开」「收起」），用户嫌丑，要求改成图标样式并调整位置与逻辑。本次改动只限 `apps/web`。

## 本次完成

**1. Moment 展开/收起（`features/moment/components/moment-item.tsx`）**
- 删除正文下方纯文字「展开/收起」按钮。
- 截断逻辑不变（`>150` 字截断 + `…`），但按钮改到卡片底部操作行的**「三个点 ⋮（更多菜单）」左侧**：图标按钮，收起态 `ChevronDown`（向下箭头=展开）、展开态 `ChevronUp`（向上箭头=收起），无任何文字。
- 样式对齐更多菜单 trigger（`flex h-6 w-6 rounded-md hover:bg-accent`）；`aria-label` 用「展开/收起」保证可访问性与测试定位。
- 交互不变：内容过长才出现按钮；点开后箭头方向反转。

**2. 日记展开/收起（`features/diary/components/diary-item.tsx`、`diary-today-card.tsx`）**
- `diary-item`（时间线条目）：文字按钮改成内容**下方**的图标按钮（`ChevronDown`/`ChevronUp`），无文字。
- **当天日记不展开/缩放**：`diary-item` 加 `isToday = diary.diaryDate === todayUTC()` 判定，当天内容全量展示、不出现任何展开按钮；其他日期超长才可收起。
- `diary-today-card`（今天卡片）：彻底移除 `expanded` 状态与 `TEXT_TRUNCATE`，直接全量渲染 `data.content`，不出现展开按钮。

**3. 测试**
- `moment-item.test.tsx`：展开/收起断言从 `getByText('展开'/'收起')` 改为 `getByRole('button', { name })`，并补截断前后文本断言。
- `diary-item.test.tsx`（新建）：非当天超长可展开/收起、短内容无按钮、当天全量展示无按钮。
- `diary-today-card.test.tsx`：补「今天日记长内容全量展示，无展开按钮」用例。
- 当天 404 → null 的既有逻辑未触碰（`api.ts` `getDiaryByDate` 保持原样）。

## 验证

- `apps/web`：`bun run typecheck` ✓、`bun run test`（vitest，35 文件 126 用例）✓、`bun run build` ✓、`bun run lint`（0 error，6 个均为既有 warning：ui 组件 fast-refresh、RHF watch）✓。
- 改动文件均无新增 lint 问题。

## 对下一次会话的提示

- 展开/收起按钮现在是无文字图标按钮，测试定位用 `getByRole('button', { name: '展开'/'收起' })`（靠 `aria-label`），不要再 `getByText`。
- `event-item` 的备注展开/收起仍是文字按钮（本次明确超范围未动），如后续统一样式可参照 moment/diary 的做法。
- 当天判定用 `todayUTC()`（`lib/date.ts`，UTC 口径），与后端 `diary.domain.ts` 的 `todayStr()` 一致；测试里非当天用例用远早固定日期（`2020-01-01`）避免被系统日期干扰。
