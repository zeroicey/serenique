# AI 对话消息懒加载需求文档

- 日期：2026-08-18
- 状态：📋 待实施
- 范围：services/api（AI 模块）、apps/web（AI feature）
- 前置记录：无

---

## 1. 背景与目标

AI 对话会话变长后（数百条消息 + tool calls），当前实现一次性加载并渲染全部消息，
导致：

- 首屏渲染慢（每条 assistant 消息经 `Streamdown` 渲染 markdown，开销叠加）
- 前端 `messages` 数组全量持有，内存占用高
- 后端 `session_ready`/`session_switched` 事件全量序列化 `toRenderMessages(session.messages)`

目标：**初始只加载最新 N 条，向上滚动到顶部时再加载更早的批次**，按需增长，
避免一次性加载全部。

## 2. 非目标

- 不改变消息存储格式（jsonl 不动）
- 不改变 `AgentSession` 实例生命周期与注册表
- 不引入服务端持久化游标（游标是 per-connection 内存态）
- 不做虚拟列表（react-window 等）——分页加载已足够，虚拟列表与 markdown 渲染
  交互复杂度高，收益不抵成本

## 3. 现状（改动前）

### 后端（`services/api/src/modules/ai`）

- `toRenderMessages(messages: AgentMessage[]): RenderMessage[]` —— 全量转换
- `session_ready` / `session_switched` 事件 `messages` 字段 = 全量
- `Conn`（handler 层）持有 per-connection 状态，已用于引用计数等
- `SessionManager.list` 返回 `messageCount`（总数已知）

### 前端（`apps/web/src/features/ai`）

- `ai-store.ts`：`messages: RenderMessage[]` 全量持有；`session_ready`/`session_switched`
  事件全量替换
- `message-list.tsx`：`messages.map(...)` 全量渲染；`scrollIntoView` 滚到底部
- 协议类型 `protocol.ts` 与后端 `ai.types.ts` 一一对应

## 4. 设计

### 4.1 分页单位

- **初始加载**：最新 20 条 RenderMessage（user+assistant 各算 1 条）
- **向上加载**：每批 30 条
- 游标 = per-connection「已下发 RenderMessage 条数」，从尾部往前数

### 4.2 turn 完整性约束

`toRenderMessages` 当前先扫一遍 `toolResult` 建索引再扫 `user/assistant`。
分页截取必须保证：

- assistant 消息的 `toolCalls` 与其 `toolResult` 不被拆到不同页
- 实际 jsonl 中 toolResult 紧跟 toolCall 之后，按 RenderMessage 条数从尾部
  截取天然成立（toolResult 不产生独立 RenderMessage，它被关联进 assistant 的
  toolCalls 数组）

**实现**：分页在 `RenderMessage[]` 层面做（转换完后切片），不在 `AgentMessage[]`
层面做，避免 toolCall/toolResult 关联断裂。

### 4.3 后端改造（`services/api`）

1. **`toRenderMessages` 保持全量转换不变**（纯函数，单测不动）
2. **新增 `tailRenderMessages(messages, limit, offset?)`**：全量转换后从尾部切片
   - `limit`：取多少条
   - `offset`：从尾部往前跳过多少条（已下发条数），默认 0
   - 返回 `{ messages: RenderMessage[]; total: number }`
3. **`session_ready` / `session_switched`** 只发尾部 20 条 + `totalMessageCount` + `hasMore`
4. **`Conn` 增加 `deliveredCount: number`**（已下发 RenderMessage 条数），切会话/建新会话重置为 0
5. **新增协议**：
   - 客户端 → 服务端：`{ type: 'load_more'; limit?: number }`（limit 默认 30）
   - 服务端 → 客户端：
     `{ type: 'messages_loaded'; messages: RenderMessage[]; totalMessageCount: number; hasMore: boolean }`
6. **`session_ready` / `session_switched` 事件结构变更**（向后不兼容，单用户内部迭代）：
   - 新增 `totalMessageCount: number`
   - 新增 `hasMore: boolean`
   - `messages` 含义不变（仍是 RenderMessage[]），但只含尾部

### 4.4 前端改造（`apps/web`）

1. **store** 增加状态：
   - `hasMoreMessages: boolean`
   - `loadingMore: boolean`
   - `totalMessages: number`
   - `loadMore: () => void`（发 `load_more`，置 `loadingMore`，收到 `messages_loaded` 后 prepend）
2. **`session_ready`/`session_switched`** 处理更新：读 `totalMessageCount`/`hasMore`，只接收尾部 messages
3. **`messages_loaded`** 处理：prepend 到 `messages` 前面，更新 `hasMore`
4. **`MessageList`**：
   - 顶部 `IntersectionObserver`（观察一个顶部哨兵 `<div>`）触发 `loadMore()`
   - 或 `onScroll`：`scrollTop < threshold` 时触发
   - **滚动位置补偿**：prepend 前记 `scrollHeight`，prepend 后 `scrollTop += (newHeight - oldHeight)`，视觉无跳动
   - 新消息/活跃轮追加在尾部，不受分页影响（现有逻辑不动）
5. **加载中提示**：顶部显示「加载更早消息…」（`loadingMore` 时）

### 4.5 协议同步

`protocol.ts`（前端）与 `ai.types.ts`（后端）必须同步更新：

- `session_ready` / `session_switched` 增加 `totalMessageCount` + `hasMore`
- 新增 `load_more`（客户端→服务端）
- 新增 `messages_loaded`（服务端→客户端）

## 5. 边界与约束

- **游标是 per-connection**：多标签页同一会话各自独立分页，互不干扰
- **切会话/建新会话**：`deliveredCount` 重置为 0，新会话从尾部重新加载
- **删除会话后建新会话**：同上，新会话无历史，`hasMore=false`
- **`load_more` 到头**：`hasMore=false`，前端不再触发
- **`load_more` 并发**：`loadingMore` 期间不重复发请求
- **活跃轮（activeTurn）期间**：可向上加载历史，不影响在途消息流

## 6. 测试

### 后端

- `ai.service.test.ts`：`tailRenderMessages` 分页正确性（边界：limit > total、offset > total、空会话）
- `ai.handler.test.ts`：`session_ready` 只发尾部 N 条 + `hasMore`；`load_more` 返回正确批次

### 前端

- `ai-store.test.ts`：`loadMore` 状态流转；`messages_loaded` prepend；`hasMore` 边界
- `message-list.test.tsx`：顶部触顶触发 `loadMore`；prepend 后滚动位置不跳

## 7. 实施顺序

1. 后端 `tailRenderMessages` + 服务层方法 + 单测
2. 后端协议扩展（`ai.types.ts`）+ `load_more` handler + `deliveredCount` + 测试
3. 前端 `protocol.ts` 同步 + store 状态 + action + 测试
4. 前端 `MessageList` IntersectionObserver + 滚动补偿 + 测试
