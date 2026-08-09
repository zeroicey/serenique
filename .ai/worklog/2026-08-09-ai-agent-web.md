# 2026-08-09 — AI 助手模块（宁序）Web 前端实施

AI 模块（宁序）的 Web 前端聊天页实施完成（后端见 `.ai/worklog/2026-08-09-ai-agent-backend.md`）：`apps/web` 的 `/ai` 占位页替换为真实聊天页，经 `/api/ai/ws` 与后端对话。SDD 流程（11 commits，逐任务子代理实现 + 评审，最终整分支评审通过）。

## 改动（分支 feat/ai-agent-web，11 commits，191c0e2..fd59115）

- **`src/features/ai/`**（新模块，自包含）：
  - `lib/protocol.ts`：WS 协议类型（与后端 `ai.types.ts` 逐字对齐，8 client + 14 server 事件）
  - `lib/ws-url.ts`：`apiWsUrl()`（http→ws 派生，优先 env.apiBaseUrl）
  - `store/ai-store.ts`：zustand——WS 连接（`setWsFactory` 可注入，jsdom 测试用 FakeSocket）、消息流状态机（**turn_end 归并** + agent_end 兜底、Map 克隆保不可变、readyState 守卫）、会话列表、`send`（busy→steer）**乐观追加 user 消息**、`lastError`
  - `components/`：MessageList / TurnView / ThinkingBlock（默认折叠）/ ToolCard（参数/结果/状态折叠）/ Composer（Enter 发送、**IME isComposing 守卫**、打断/停止）/ SessionSidebar（新建/切换/删除 + 在线状态点）/ ChatArea（组装 + sonner toast 错误）
  - `pages/ai-page.tsx`：挂载时 `connect()`（store 幂等）
- **streamdown 集成**：Vite/Tailwind v4 的 `@source` 行是 **2 层路径**（`../../node_modules/streamdown/dist/*.js`——bun 把包 symlink 在 `apps/web/node_modules/` 而非根 hoist，brief 假设的 3 层是错的）；`animated` + `isAnimating` 流式渲染，历史静态；用户消息纯文本不做 markdown
- **配置**：vite.config.ts proxy `/api` 加 `ws: true`；router.tsx `/ai` → ai-page（保留 handle.nav 宁序）；清理 placeholder-module-page 的 '/ai' 死映射
- 顺手清了本分支 ai 文件里的 lint 问题（`as any`、unused）

## 验证

- `bun run typecheck` / `bun run test`（44 files / 194 tests）/ `bun run lint`（分支零新增，main 基线 6 个非 ai 问题本来就红）/ `bun run build` 全绿
- `dist/assets/ai-page-*.js` 含 `data-streamdown`、CSS 含 `streamdown-caret`——streamdown 进包生效
- store 测试 7 例：FakeSocket 驱动真实事件路径（多轮工具卡归并、turn_end、busy→steer、乐观追加）
- **浏览器冒烟未做**（本地无 PostgreSQL + 端口被占）——协议层由 FakeSocket 全覆盖；部署环境需补一次浏览器验证

## 坑 / 对下一次会话的提示

- **jsdom 无 WebSocket**：store 连接层必须可注入 wsFactory；FakeSocket 永不触发 onclose → connect 幂等不能依赖 `if (ws)`，用 store status 判断
- **turn 归并**：后端每轮工具调用发 `turn_start → … → turn_end`（每轮必发），第二轮 turn_start 会重置——store 必须 turn_end 归并，agent_end 只兜底；否则首轮工具卡丢失
- **IME**：中文输入法 Enter 确认候选词会误触发发送——keydown 必须 `!e.nativeEvent.isComposing`；jsdom 测试注入 `{ isComposing: true }` 直接走 KeyboardEventInit（包装 nativeEvent 字段读不到）
- **streamdown**：`**bold**` 渲染为 `span[data-streamdown="strong"]` 非 `<strong>`；styles.css 纯 keyframes 与 shadcn 主题兼容；`rehype-sanitize` 默认净化 HTML
- **hono WSContext**（后端侧）：每次回调新建实例——连接 Map 用 `ws.raw` 作 key（前端无此问题）
- 乐观追加 user 消息是**前端设计决策**（后端事件流无 user 回显）——若后端未来加回显需去重；未 OPEN 时 sendMsg 静默丢弃会留 phantom 消息（已知）

## 遗留（后续）

- 部署环境补浏览器冒烟（连接→会话→对话→工具卡→打断）
- follow-up 可选：滚动贴底优化（仅贴近底部才跟随）、toast 去重（`id: 'ai-error'`）、WS 断线自动重连、main lint 基线清理（6 个非 ai 问题）、thinking-only 轮空气泡、aria-expanded
- 需求文档 `.ai/requirements/2026-08-09-ai-agent-module.md` 状态更新为 ✅已实施（待部署验收）
