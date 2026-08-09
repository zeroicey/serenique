# 2026-08-09 — AI 助手模块（宁序）后端实施

AI 模块需求经调研（PI SDK）+ 架构评审（子代理，修正 CSWSH/并发写坏等 10 项）+ 方案讨论定型后，在 `feat/ai-agent-module` 分支按 SDD 流程（逐任务子代理实现 + 评审）完成后端：PI SDK 内嵌、15 个业务工具直调 service 层、`/api/ai/ws` WebSocket 流式对话、会话 jsonl 持久化。需求文档 `.ai/requirements/2026-08-09-ai-agent-module.md`（🔶设计中，后端部分已实施）。

## 改动（分支 feat/ai-agent-module，10 commits，548ac8f..51176ba）

- **services/api**：新增 `src/modules/ai/` 模块（ai.tools / ai.system-prompt / ai.service / ai.handler / ai.types / ai.router / index）
  - `ai.tools.ts`：`buildAiTools()` 15 个工具（task 7 + event 5 + moment 3）经 `defineTool` 直调 service 层；**execute 失败直接 throw**（SDK runner 只认抛异常标记 isError，返回体 `isError` 字段会被忽略）
  - `ai.service.ts`：ModelRuntime（env 凭据）/ 隔离 loader（SettingsManager.inMemory + noExtensions 等 5 项 + systemPromptOverride）/ **同会话单实例注册表 `Map<sessionId, Promise<AgentSession>>`**（in-flight 去重防 TOCTOU）；`excludeTools` 排除 7 个内置工具（bash/read/edit/write/grep/find/ls，**字段名是 excludeTools 不是 excludedToolNames**）；会话目录 dev 相对包根 `./.data/sessions`、生产 `/data/sessions`
  - `ai.handler.ts`：Hono upgradeWebSocket + Origin 白名单门禁（CORS_ORIGIN + WEBAUTHN_ORIGINS，防 CSWSH）+ **会话引用计数**（多连接同会话，最后离开才 releaseSession；delete 例外无条件删）；连接 key 用 `ws.raw`（hono WSContext 每次回调新建实例）；handleMessage 全局 try/catch（Bun unhandled rejection 会崩进程）
  - `app.ts`/`index.ts`：`createBunWebSocket()` 单例注入链（upgradeWebSocket 与 websocket 必须同源，否则升级 404）；`createApp(env, ws)` 签名变更已同步全部调用方
  - 集成测试 `ai.integration.test.ts`：**faux provider**（pi-ai 本地假模型）驱动真实 agent 循环 → create_task 真落库断言；RUN_DB_TESTS 门控
- **部署**：Dockerfile `mkdir -p /data/sessions` + chown 10001；`.env.example` 补 `DEEPSEEK_API_KEY`/`AI_MODEL`/`AI_SESSION_DIR`；AGENTS.md Docker 节补 `-v /host/sessions:/data/sessions`
- 依赖：`@earendil-works/pi-coding-agent@^0.84.1` + `typebox@1.3.7`（必须精确 1.3.7，与 pi-agent-core 传递依赖一致）+ `@earendil-works/pi-agent-core`/`pi-ai`（直接依赖，类型需要）

## 验证

- `bun run typecheck`（api）通过；`bun test`（api）168 pass / 120 skip(DB) / 0 fail
- 集成：`RUN_DB_TESTS=1 bun test src/modules/ai/ai.integration.test.ts` PASS（faux provider 真落库）
- Task 5 真实服务器冒烟（本地 DB + 模型凭据）：升级 101 / 非法 Origin 403 / 未认证 401 / prompt 全事件链 / 双连接引用计数 / 删除未落盘会话，全部通过
- Task 7：`docker build` 成功（506 packages，617MB，/data/sessions 属主 10001 可写）

## 坑 / 对下一次会话的提示

- **SDK 字段名**：`excludeTools`（CreateAgentSessionOptions）；`tools: []` 会把 customTools 业务工具也过滤掉（空 Set 非 undefined）
- **`AgentToolResult` 无 `isError` 字段**：execute 失败要 throw，runner 才标 isError
- **faux provider 用法**（0.84.1）：`ModelRuntime.create({ models })` 不存在 → `modelsPath: null` + `registerNativeProvider(faux.provider)`；`fauxAssistantMessage(text, {toolCall})` 不存在 → content 数组 `[fauxText, fauxToolCall]`；`model: faux.model` → `faux.getModel()`
- **hono WS**：`createBunWebSocket()` 的 upgradeWebSocket/websocket 必须同一次调用（否则升级 404）；`Bun.serve` export 必须含 `websocket`；WSContext 每次回调新建 → 连接 Map 用 `ws.raw` 作 key；WS 无 CORS 预检 → Origin 白名单必须手动做（生产 cookie SameSite=None 有 CSWSH 风险）
- **SessionManager**：新建会话首次消息前不落盘（`findSessionPath` 找不到）；无 delete API（unlink 文件）；jsonl 整文件重写无锁 → 同会话必须单实例注册表
- **Bun**：unhandled rejection 默认崩进程 → WS 消息处理必须全局 try/catch
- **时区**：容器 TZ=Asia/Shanghai 已固定（Dockerfile），buildSystemPrompt(new Date()) 直接用本地时间
- 集成测试坑：`bun test src/modules/ai/` 整目录 + RUN_DB_TESTS 会挂（ai.tools.test.ts 的 mock.module 进程级毒化 task.service）——单文件或 integration glob 不受影响（文件头有警示）

## 遗留（后续）

- 前端 Web 聊天页：`.ai/archive/2026-08-09-ai-agent-web-plan.md`（二级侧边栏 + streamdown + zustand）待执行
- 需求文档状态待整体完成后改 ✅已实施；AGENTS.md 架构节补 ai 模块与 env 键（本 worklog 已包含要点）
- 多连接同步（删除不广播给其它连接）——需求 4.2.1 独立后续任务
- 服务器部署：`-v /host/sessions:/data/sessions` + 既有卷一次性 chown 10001（与 blobs 卷同规则）
