# 2026-08-10 — Flutter 移动端 AI 模块（宁序）实施

移动端 AI 聊天模块实施完成（后端见 `.ai/worklog/2026-08-09-ai-agent-backend.md`，Web 见 `.ai/worklog/2026-08-09-ai-agent-web.md`）：`apps/mobile` 的 `/ai` 占位页替换为真实聊天页，经 `/api/ai/ws` 与后端对话（Bearer token 握手，**后端零改动**）。SDD 流程（plan `docs/superpowers/plans/2026-08-10-flutter-ai-module.md` → 已归档 `.ai/archive/2026-08-10-flutter-ai-module-plan.md`），Tasks 1-5 逐任务子代理实现 + 评审：commits `dfd8dd1` / `a761928` / `814c8df` / `21996dc` / `38eb01d`。

## 做了什么

- **依赖（4 个）**：`web_socket_channel` ^3.0.3（WS 连接，`IOWebSocketChannel.connect(uri, headers:)` 支持自定义 Bearer 头）、`flutter_markdown_plus` ^1.0.12（历史消息静态渲染 `MarkdownBody`）、`flutter_markdown_stream` ^0.4.0（流式渲染，构建于 flutter_markdown_plus 之上）、`url_launcher` ^6.3.2（markdown 链接点击）
- **`lib/features/ai/`**（新模块，自包含）：
  - `ai_protocol.dart`：WS 消息类型，逐字段对齐后端 `ai.types.ts`（只复制结构不 import）
  - `ai_models.dart`：RenderMessage / TurnState / ToolCardState / SessionItem
  - `ai_client.dart`：WS 连接封装（Bearer header、connecting/online/offline 状态、JSON 收发）
  - `ai_controller.dart`：Riverpod Notifier——连接生命周期 + 消息流聚合（≈ Web `ai-store.ts`）
  - `ai_providers.dart`：provider 定义
  - `widgets/`（6 个）：message_list（自动滚底）、assistant_message（thinking 折叠 + MarkdownStream）、tool_card（工具调用卡片）、composer_bar（busy 禁用 + 停止按钮）、session_sheet（会话底部弹层：新建/切换/删除 + 删除确认）、session_title（AppBar 标题区）
  - `ai_page.dart`：挂载时 `connect()`（幂等）+ `AppLifecycleListener` 回前台自动重连
- **流式方案**：每轮 `turn_start` 创建 text 增量 `StreamController<String>`（挂在 activeTurn 上），`MarkdownStream(stream:)` 流式渲染；`turn_end` 归并进 messages 后 close controller（流式 widget 卸载、切静态 `MarkdownBody`）；`agent_end` 兜底归并；空轮不追加（对齐 Web 模式）
- **路由/壳**：`router.dart` 的 `/ai` 从 `PlaceholderPage` 换成 `AiPage`；AppShell 对 `/ai` 条件渲染会话名标题（与 `/audit` action 同模式）
- **认证**：`/api/ai/ws` 不在 allowlist，走现有中间件栈，Bearer 在握手时自动认证；Origin 白名单对**无 Origin 头的非浏览器客户端放行**（设计文档 §5 已验证）

## 验证

- `flutter analyze` 无 issue；`flutter test` **180/180 全部通过**（新增 ai_client / ai_controller / ai_models / ai_protocol / ai_page / session_sheet / tool_card / composer_bar / message_list 测试 + router_test）
- 假通道测试模式：测试注入 FakeWsChannel 驱动真实事件路径（聚合 / turn 归并 / 工具卡 / 错误 / 乐观追加全覆盖）
- **真机手测未做**（iOS 真机 + dev server）——见下方清单

## 坑 / 对下一次会话的提示

1. **`implements WebSocketChannel` 在测试里编译不过**（web_socket_channel 3.0.3）：`StreamChannelMixin` 强制 7 个成员实现——测试假通道必须 `dynamic noSuchMethod(Invocation i) => throw UnsupportedError(...)` 兜底，不能只实现 stream/sink/close 三个成员
2. **`ProviderContainer` 不是 `WidgetRef`**（Riverpod 3.4.2）：widget 测试里开底部弹层（session_sheet）必须用 `Consumer` 的 ref（`showSessionSheet(ref)`），不能从 container 拿；且 `showModalBottomSheet` 需要 `MaterialLocalizations`——测试必须包 MaterialApp，裸 `Scaffold` 里开弹层会抛错
3. **brief/plan 原稿的 `copyWith` 无法清空 activeTurn**：`?? this.activeTurn` 会把 null 吞掉——实现期已用 `clearActiveTurn` flag 修复（镜像 `clearError` 约定）
4. **假通道事件经 broadcast stream 异步投递**：发完事件必须 `pumpEventQueue()` 冲刷再断言，否则测试时序不稳（假红）
5. **FakeWsChannel 已在 4 个测试文件重复**（ai_client_test / ai_controller_test / ai_page_test / router_test）——下次抽到 `test/helpers.dart` 共享（helpers.dart 已存在，内含 FakeTokenStorage；可另建 fake_ws_channel.dart 或并入）

## 真机手测清单（iOS 真机，dev server）

- [ ] 连接建立（Bearer 握手成功，AppBar 显示会话名）
- [ ] 断线横幅 + 重试按钮（关 dev server / 飞行模式触发）
- [ ] 回前台自动重连（仅 offline 时触发）
- [ ] 会话新建 / 切换 / 删除（含删除确认对话框）
- [ ] 停止回复（busy 时停止按钮发 abort）
- [ ] markdown 表格与代码块流式效果（无闪烁）
- [ ] thinking 折叠（默认折叠、可展开）
