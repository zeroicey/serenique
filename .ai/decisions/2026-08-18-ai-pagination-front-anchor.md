# AI 对话消息分页游标：稳定前端边界（front anchor）决策记录

日期: 2026-08-18
适用范围: `services/api`（AI 模块）分页游标、`apps/web` / `apps/mobile` 懒加载消费端
前置记录: `.ai/requirements/2026-08-18-ai-message-lazy-load.md`、`.ai/worklog/2026-08-18.md`

## 2026-08-18-A1 分页游标锚定稳定前端边界，而非「从尾部回数的已下发条数」

- **背景**：AI 对话消息懒加载初始设计（commit 1264f71）用 `Conn.deliveredCount`
  （从尾部回数的已下发 RenderMessage 条数）作 `load_more` 的 offset。评审发现该
  游标在「activeTurn / 新消息在尾部追加」时失效：offset 按**当时**的 total 起算，
  会话尾部增长后 offset 相对新的更大 total 重算，返回的批次与客户端已持有消息
  **重叠** → UI 出现重复 RenderMessage（Flutter 触顶即可复现，Web 被
  IntersectionObserver 挂载缺陷掩盖、修复后同样触发）。
- **决策**：游标改为稳定前端边界 `conn.anchor` = 客户端当前持有的**最早**
  RenderMessage 下标。初始由 `sessionPagination(session.messages)` 计算
  （= `tail.total - tail.messages.length`，即尾部起点）；每次 `load_more` 取
  `[anchor - limit, anchor)`，返回后 `anchor = nextAnchor`。切会话/建新会话/删除
  后统一经 `sessionPayload` 重算基线。
- **Why**：
  - 消息只增不改、fresh 轮次只在尾部追加：一旦某个下标进入客户端，它之前的
    消息永远比它更早、下标永不再变——前端边界是**单调稳定**的。
  - 对比项：按「尾部回数」的游标（deliveredCount）在尾部增长时相对新 total
    重新解释，已下发窗口随之漂移，是重复消息的根因。
  - 对比项：让客户端上报 `messages.length` 再由服务端算 offset——协议耦合客户端
    内部数组长度、且同样受「尾部追加 vs 已下发计数」不一致影响，不如锚定服务端
    可独立推导的绝对下标。
  - 分页仍在 `RenderMessage[]` 层切片（`toRenderMessages` 全量转换后），
    toolCall/toolResult 关联（同一 RenderMessage 内）天然不被拆散。
- **How to apply**：
  - 后端：`ai.service.ts` 的 `nextOlderPage(messages, limit, anchor)`（返回
    `[anchor-limit, anchor)` + `nextAnchor`）与 `sessionPagination(messages)`
    （返回尾部 20 条 + 初始 anchor）；`ai.handler.ts` 的 `Conn.anchor` 在
    `sessionPayload` / `session_ready` 初始化、`load_more` 分支推进。
  - Web：`ai-store.ts` 镜像为 `oldestHeldIndex`（session 事件 =
    `totalMessageCount - messages.length`，`messages_loaded` 前移 batch 长度，
    尾部追加不变），列表 key = `oldestHeldIndex + i`——prepend 后已持有消息不
    重挂载，ThinkingBlock/ToolCard 展开态不丢。
  - `load_more.limit` 服务端钳到 `[1, 200]`：limit<=0 会返回空批次却 hasMore=true、
    anchor 不变，web 客户端将无限空转。
  - 回归测试：`ai.service.test.ts` 的「turn 尾部追加后 load_more 与已持有消息不
    重叠」「分页状态机：初始 → 多批严格递减 → 终态 hasMore=false」；Web store 的
    `oldestHeldIndex` 基线/prepend/尾部追加用例。

## 明确拒绝 / 延期的决策

| 提议 | 结论 | 理由 |
| ------ | ------ | ------ |
| 按「从尾部回数的已下发条数」（deliveredCount）做 offset | 拒绝 | 尾部增长后相对新 total 重算，与客户端已持有消息重叠 |
| 客户端上报 `messages.length`，服务端按 `total - clientCount` 取 offset | 拒绝 | 协议耦合客户端数组内部长度，同一不一致问题换个入口再现 |
| 客户端按消息内容 / 时间戳去重兜底 | 拒绝 | 治标不治本：重叠仍是带宽浪费，且去重需要稳定消息标识（当前 RenderMessage 无 id）；改为根因修复 |
| 服务端持久化游标 | 拒绝（沿用需求 §2 非目标） | 游标是 per-connection 内存态，多标签页互不干扰；持久化引入落盘/失效问题 |
