# Flutter 移动端 AI 模块（宁序）设计文档

- 日期：2026-08-10
- 状态：🔶设计中（已获用户批准，待实施）
- 范围：apps/mobile（Flutter，iOS + Android）
- 前置记录：`.ai/requirements/2026-08-09-ai-agent-module.md`（后端 ✅已实施 + Web ✅已实施，移动端待实施）；`.ai/architecture/2026-08-06-flutter-mobile-tech-stack.md`（移动端已锁定技术栈）；Web 实现 `apps/web/src/features/ai/`（照搬参照物）
- 权威协议来源：`services/api/src/modules/ai/ai.types.ts`（后端；`apps/web/src/features/ai/lib/protocol.ts` 是它的类型镜像）

---

## 1. 背景与目标

Web 端与后端 AI 模块（宁序）已上线生产。移动端侧栏已有「宁序」占位（`/ai` 路由 → `PlaceholderPage`），本次将其替换为真实聊天页，功能与 Web 端对齐：

- WS 聊天（prompt / abort / 会话管理）
- 流式 Markdown 渲染（无闪烁）
- 思考块（thinking，默认折叠）
- 工具调用卡片（参数/结果/状态）
- 会话新建 / 切换 / 删除
- 断线横幅 + 手动重试 + 回前台自动重连

**不做**：语音输入（系统输入法自带语音转文字，与 Web/后端决策一致）、推送通知、后端任何改动（移动端经 Bearer token 握手，后端已天然放行，见 §5）。

## 2. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 流式 Markdown 方案 | **flutter_markdown_stream**（`SafeMarkdownParser` 投影未闭合语法 + 单帧防抖），它构建在 flutter_markdown_plus（官方停更包 `flutter_markdown` 的钦定继任，Foresight Mobile 维护）之上，API 是其超集 |
| 2 | 会话切换 UI | AppBar 标题区 = 宁序 + 当前会话名（▾），点击弹 **bottom sheet**（新建/切换/删除），等价 Web 的 header 下拉 |
| 3 | 断线策略 | 离线横幅 + 手动重试 + App 回前台自动重连 |
| 4 | 聊天 UI | Material 3 内置组件自写，不引聊天 UI 套件（延续技术栈"不引组件库"原则） |

## 3. 新增依赖（共 4 个）

| 包 | 用途 | 说明 |
|----|------|------|
| `web_socket_channel` | WS 连接 | dart-lang 官方；`IOWebSocketChannel.connect(uri, headers:)` 支持自定义头（Bearer） |
| `flutter_markdown_plus` | Markdown 静态渲染 | 历史消息 `MarkdownBody` |
| `flutter_markdown_stream` | 流式渲染 | `MarkdownStream(stream:)`，sanitizer 纯 Dart、单测完备 |
| `url_launcher` | markdown 链接点击 | 主流标准包 |

## 4. 模块结构

```
apps/mobile/lib/features/ai/
├── ai_protocol.dart     # WS 消息类型（逐字段对齐后端 ai.types.ts，仅复制结构不 import）
├── ai_models.dart       # RenderMessage / TurnState / ToolCardState / SessionItem
├── ai_client.dart       # WS 连接封装：Bearer header、状态（connecting/online/offline）、收发
├── ai_controller.dart   # Riverpod Notifier：连接生命周期 + 消息流聚合（≈ ai-store.ts）
├── ai_providers.dart    # provider 定义
├── ai_page.dart         # 聊天页（挂载 connect + AppLifecycleListener）
└── widgets/
    ├── message_list.dart      # 消息流 + 自动滚底
    ├── assistant_message.dart # thinking 折叠 + MarkdownStream / MarkdownBody
    ├── tool_card.dart         # 工具调用卡片
    ├── session_sheet.dart     # 会话底部弹层
    └── composer_bar.dart      # 输入栏（busy 禁用 + 停止按钮）
```

路由：`router.dart` 的 `/ai` 由 `PlaceholderPage` 换成 `AiPage`（仍在 AppShell 内，侧栏「宁序」入口不动）。
AppShell：对 `/ai` 条件渲染会话名标题（与 `/audit`「全部已读」action 同模式，最小耦合）。

## 5. WS 连接与认证（后端零改动，已验证）

- **URL**：`AppConfig.apiBaseUrl` → `ws(s)://host/api/ai/ws`（镜像 Web `ws-url.ts` 的 http→ws 替换逻辑）。
- **认证**：`IOWebSocketChannel.connect(url, headers: {'Authorization': 'Bearer <token>'})`，token 读 `authController.token`。
  - 已验证：`ai.router.ts` 的 Origin 白名单对**无 Origin 头（非浏览器客户端）放行**；`auth.middleware.ts` 支持 Bearer，且 `/api/ai/ws` 不在 allowlist，走现有中间件栈 → 握手时自动完成认证。
  - 握手 401（token 失效）→ 错误横幅 + 提示重新登录（走现有 logout 流程）。
- **幂等 connect**：非 offline 状态不重建连接（同 Web `ai-store.ts` 逻辑）。
- **收包**：`channel.stream` 逐条 JSON 解析，按 `type` 分发（switch，同 Web）。

## 6. 状态管理与数据流

### 6.1 状态模型（照搬 Web store）

```
status: connecting | online | offline
busy: bool                    # agent_start→true, agent_end/error→false
lastError: String?            # error 事件或 action 异常；正常 agent_end 清空
currentSessionId / model
sessions: List<SessionItem>   # {id, name, messageCount, modified}
messages: List<RenderMessage> # {role, text, thinking, toolCalls[]}
activeTurn: TurnState?        # {id, thinking, text, toolCards: Map<toolCallId, ToolCardState>}
```

### 6.2 事件聚合（switch 分发，与 Web `ai-store.ts` 一致）

| 事件 | 动作 |
|------|------|
| `session_ready` / `session_switched` | 设 currentSessionId/model/messages（作为 RenderMessage 历史），busy=false、activeTurn=null、清 lastError，刷新会话列表 |
| `sessions` | 更新会话列表 |
| `session_deleted` | 刷新会话列表 |
| `error` | busy=false + lastError |
| `agent_start` / `agent_end` | busy=true / busy=false+清错误+归并当前轮 |
| `turn_start` | 创建 activeTurn（++seq）+ **创建 text 增量 `StreamController<String>`** |
| `turn_end` | 归并当前轮进 messages |
| `message_update` | text_delta/thinking_delta 追加（text 同时写入对应 StreamController） |
| `tool_execution_start/update/end` | 卡片增 / result 追加 / 落定（running=false, isError） |

归并规则：`turn_end`（每轮必发）为主路径、`agent_end` 兜底；空轮（无 text/thinking/工具卡）不追加；归并后重置 activeTurn 并 **close 其 StreamController**（流式 widget 卸载，切静态渲染）。

### 6.3 发送

- `send(text)`：trim 非空才发；**乐观追加** user 消息（后端事件流无 user 回显，不本地追加则实时对话中用户消息不显示）；发 `{type:'prompt'}`。busy 期间输入框禁用（不打断、不排队，一条对一条），停止按钮发 `{type:'abort'}`。
- 会话管理：`new_session` / `switch_session` / `delete_session` / `list_sessions`（refresh）。

## 7. UI 组件

| 组件 | 说明 |
|------|------|
| `AiPage` | 挂载时 `connect()`（幂等）；`AppLifecycleListener` 回前台且 offline → 自动重连；`lastError` → SnackBar（对齐 Web toast） |
| `MessageList` | ListView + 底部锚点自动滚底；user 右对齐气泡 / assistant 左对齐 |
| `AssistantMessage` | thinking 折叠块（默认折叠，展开纯文本）+ 正文：历史消息 `MarkdownBody`（静态），activeTurn 用 `MarkdownStream(stream: turn.textController.stream)`；`onTapLink` → `url_launcher` |
| `ToolCard` | 图标 + 工具名 + 状态（running 转圈）+ 参数/结果可展开（ExpansionTile，窄屏友好）；错误红显；result 追加逻辑对齐 Web（end 时换行拼接） |
| `ComposerBar` | 多行 TextField + 发送按钮；busy → 禁用 + 停止按钮（Icons.stop） |
| `SessionSheet` | bottom sheet：顶部「新建会话」+ 会话列表（当前项高亮、删除按钮），删除前确认对话框（"删除会话「x」？此操作不可恢复。"） |

## 8. 生命周期与错误处理

- 断线（`onclose`/`ondone`）：status=offline、busy=false；**messages 不清空**（历史仍在列表可读）。
- 离线横幅：输入栏上方显示"连接已断开" + 重试按钮 → `connect()`。
- 回前台自动重连：`AppLifecycleListener(resume: ...)`，仅 offline 时触发。
- 握手失败/网络错误 → lastError → 横幅/SnackBar。
- WS `error` 事件（后端业务错误）→ lastError → SnackBar。

## 9. 测试策略

门禁：`flutter analyze` + `flutter test`（延续技术栈文档 §8）。

| 层 | 覆盖 |
|----|------|
| 单元测试 | `ai_protocol` 编解码；`ai_controller` 聚合逻辑——**注入假 WS**（镜像 Web `ai-store.test.ts` 的 wsFactory 模式）：事件序列 → 状态/消息断言（含 turn 归并、工具卡、错误、乐观追加） |
| Widget 测试 | `ProviderScope(overrides:)` 注入 mock controller：message_list / composer_bar / tool_card / session_sheet 渲染与交互 |
| 集成/端到端 | 不做（延续纯在线策略；真机手测） |

## 10. 文档与后续

- 实施计划（writing-plans 或直接拆 Task）→ 交给 flutter-agent 实施；模块照 `features/<模块>/` 平铺结构。
- 更新 `.ai/requirements/2026-08-09-ai-agent-module.md` 范围：移动端（⏳待实施）；实施完成后置 ✅。
- 本设计稿定稿后进 `.ai/archive/`（实施完的计划类文档惯例）。
