# AI 助手模块（宁序）需求文档

- 日期：2026-08-09
- 状态：✅已实施（后端 2026-08-09 + Web 前端 2026-08-09 + 移动端 2026-08-10 均完成）
  - 2026-08-10 更新：✅移动端（Flutter `apps/mobile`）AI 聊天模块已实施 — `/ai` 占位页替换为真实聊天页（WS Bearer 握手、流式 Markdown、thinking 折叠、工具卡、会话弹层、断线横幅 + 回前台重连），后端零改动。设计稿 `.ai/architecture/2026-08-10-flutter-ai-module-design.md`；实现记录 `.ai/worklog/2026-08-10-flutter-ai-module.md`
  - 2026-08-10 更新：✅AI 工具权限扩展 — 工具从 15 个扩到 32 个：任务组补齐 get/update/delete、闪念补 update/delete、标签全量（list/get/create/rename/delete）、闪念标签绑定（add/remove/replace）、闪念评论全量 CRUD。实现记录 `.ai/worklog/2026-08-10-ai-tools-expansion.md`
- 范围：services/api（新增 ai 模块，PI SDK 内嵌）+ apps/web（/ai 页面聊天 UI）+ apps/mobile（Flutter /ai 聊天页）；后端为第一优先级
- 前置记录：`.ai/decisions/2026-08-08-mcp-sunset.md`（MCP 停更冻结，AI 能力不再走 MCP/外部工具层）；`apps/web` 侧边栏已有 `/ai`「宁序」占位路由
- 参考原型：`~/workspace/tests/pi-test`（PI SDK + WebSocket 最小对话服务，含会话持久化/切换 + e2e 测试）
- 实施计划：后端 `.ai/archive/2026-08-09-ai-agent-backend-plan.md`；前端 `.ai/archive/2026-08-09-ai-agent-web-plan.md`；移动端 `.ai/archive/2026-08-10-flutter-ai-module-plan.md`

---

## 1. 背景与目标

日常添加任务、添加事件（日历）、打卡习惯、添加提醒的操作过于繁琐（填表单 → 创建 → 记得去完成打勾）。目标：通过聊天框 + 语音转文字，让 AI 直接代管一天的计划、任务和日程；用户只需对话，AI 调用系统内部能力完成增删改查。

**核心原则（已定）：**

- 内置 AI **直接调用 API 的 service 层**（TS 代码），不走 CLI、不走 MCP——不绕路、不重复维护。
- Agent 循环（思考/工具调用/流式输出/重试/中止）由 PI SDK 承担，我们不做循环，只做：系统提示词、工具注册（权限边界）、WS 消息协议、前端渲染。
- **暂不做**弹窗确认（用户说需求 → AI 确认 → 才执行），第一版直接执行。
- 暂不做 skills 系统，系统提示词 + 工具描述足够。

**长期方向（暂不实施）：** 习惯模块上线后加入打卡工具；moment 附件（blob 上传）暂不放开。

## 2. 技术选型：PI SDK（@earendil-works/pi-coding-agent）

调研结论（基于 ~/workspace/tests/pi-test，版本 0.84.1）：

- **自定义工具**：`defineTool()` + `createAgentSession({ customTools })`。`ToolDefinition` 含 `name/label/description/parameters(TypeBox)/execute(toolCallId, params, signal, onUpdate, ctx) → { content, details }`。execute 内可直接 import 并调用 `taskService`/`eventService` 等 —— **验证可行，无需 MCP/CLI 中转**。
- **Agent 循环与事件**：`session.prompt()/steer()/followUp()/abort()`；事件流 `agent_start / turn_start / message_update(text_delta|thinking_delta) / tool_execution_start|update|end / turn_end / agent_end`，`session.subscribe()` 订阅。测试项目已完整走通。
- **会话管理**：`SessionManager` 文件持久化（jsonl）、`continueRecent/open/create/list`、会话树、自动恢复历史 —— 会话管理功能免费获得。
- **系统提示词**：`DefaultResourceLoader({ systemPromptOverride, appendSystemPromptOverride })` 完全接管。⚠️ `systemPromptOverride` **必须返回真实提示词字符串**（返回 undefined 会回退到默认编程助手提示词）；自定义提示词时 SDK 不再注入默认 "Available tools" 段，需自行说明业务工具用法（工具 schema 仍通过 LLM function-calling 传入）。
- **隔离与安全**：`SettingsManager.inMemory()` + `noExtensions/noSkills/noPromptTemplates/noThemes/noContextFiles` 切断全局 `~/.pi/agent` 资源加载（防 pi-mcp-adapter 等泄漏）。⚠️ **禁用内置工具的正确写法**：`excludeTools: ["bash","read","edit","write","grep","find","ls"]`（7 个内置全列）或 `noTools: "builtin"`——**不能用 `tools: []`**（空数组 = 空 Set 非 undefined，会把 customTools 业务工具也一并过滤掉，agent 将无工具可用）。agent 只能调用我们注册的业务工具 → **容器内无逃逸路径**。
- **模型凭据**：`ModelRuntime.create()` 读 `auth.json` 或环境变量（pi-ai 内置 opencode-go provider，`OPENCODE_API_KEY` 支持 env 认证，走 opencode.ai 网关）—— Docker 部署用 env 注入即可；`PI_MODEL="provider/modelId"` 可覆盖模型选择。**默认 pin 为 `opencode-go/deepseek-v4-flash`**（走 opencode 网关，凭据 `OPENCODE_API_KEY`；不配 `DEEPSEEK_API_KEY`——DeepSeek 官方直连为备选）。

## 3. 数据模型（设计方向）

**无新数据库表。** 会话由 PI `SessionManager` 持久化为 jsonl 文件（自带消息历史/树形分支），存储于独立持久化卷 `/data/sessions`（与 BLOB_ROOT 同级分开挂载）。会话列表/切换/新建走 SessionManager API；**删除 = 直接 unlink 会话文件（SessionManager 无 delete API）**，配合会话实例注册表（见 4.2.1）防止他连接复活已删文件。**损坏容错**：jsonl 非原子写，崩溃可能留半写文件——打开失败时隔离改名（`.corrupt`）并跳过，记录日志，不让 `continueRecent` 选中坏文件。

## 4. 模块结构与业务规则（设计方向）

### 4.1 后端模块 `services/api/src/modules/ai/`

| 文件 | 职责 |
|------|------|
| `ai.tools.ts` | `defineTool` 注册业务工具（封装 service 调用），TypeBox 参数 schema |
| `ai.system-prompt.ts` | 系统提示词（角色、可用工具说明、日期/时区、中文输出要求）——必须返回真实字符串 |
| `ai.service.ts` | 单例 `aiService`：AgentSession 生命周期、**会话实例注册表**（同会话单实例）、会话 CRUD、事件→WS 转发、模型/凭据初始化 |
| `ai.handler.ts` | `/api/ai/ws` WebSocket 升级 + 消息处理（Hono `upgradeWebSocket`）+ **Origin 白名单校验** |
| `ai.types.ts` | WS 协议消息/事件类型定义（Zod） |
| `ai.router.ts` | 挂载路由（走现有 auth 中间件，不进 allowlist 白名单） |
| `index.ts` | barrel 导出 |

⚠️ **结构性改动（评审发现）**：`services/api/src/index.ts` 的 `Bun.serve` 目前只有 `{ port, fetch }`，**必须挂载 `hono/bun` 的 `createBunWebSocket()` 返回的 websocket handlers**，否则所有 WS 升级返回 404。WS 升级请求会先经过现有中间件栈（cors → logger → auth），cookie/Bearer 认证在握手时自动生效，无需额外 allowlist。

`exports.ts` **不导出** `aiService`（无外部消费方；避免把 pi 依赖拖进 workspace 导出图）。

### 4.2 工具集（第一批 + 2026-08-10 扩展）

写操作直接执行（无确认弹窗），**读写全量开放**——查询类工具不仅是操作需要，平时闲聊（如"我今天有哪些任务"）也要用。第一批范围（2026-08-10 更新：任务组补齐、闪念写操作、标签、评论已放开）：

| 工具 | 说明 | 对应 service |
|------|------|-------------|
| `list_task_groups` / `create_task_group` / `get_task_group` / `update_task_group` / `delete_task_group` | 任务组全量 CRUD | taskService |
| `list_tasks` / `get_task` / `create_task` / `update_task` / `delete_task` | 任务全量 CRUD（含 status 流转） | taskService |
| `list_events` / `get_event` / `create_event` / `update_event` / `delete_event` | 事件（日历）全量 CRUD | eventService |
| `list_moments` / `get_moment` / `create_moment` / `update_moment` / `delete_moment` | 闪念全量 CRUD | momentService |
| `add_moment_tag` / `remove_moment_tag` / `replace_moment_tags` | 闪念标签绑定（replace 幂等，传空数组清空） | momentService |
| `list_tags` / `get_tag` / `create_tag` / `rename_tag` / `delete_tag` | 标签全量 CRUD（名称 1-32 字符） | tagService |
| `list_moment_comments` / `add_moment_comment` / `update_moment_comment` / `delete_moment_comment` | 闪念评论全量 CRUD（内容 1-2000 字符） | momentCommentService |
| 打卡（习惯） | **待习惯模块实施后**加入 | （暂无） |

未放开：blob 上传/附件（`addAttachment`/`deleteAttachment`）、审计、token、auth —— 对话场景暂不需要，后续按需加。

权限边界：agent 可用的工具 = customTools 白名单，内置 bash/read/edit/write 全部排除；单用户部署 + WS 级认证（session cookie / Bearer token），"逃逸"风险仅剩业务工具本身（只操作业务数据，无文件/命令能力）。

### 4.2.1 会话实例模型（已确认，评审修正）

**进程内「同会话单实例」注册表**（`Map<sessionId, AgentSession>`）：

- 连接建立/切换会话 → 从注册表取实例；不存在则 `SessionManager.continueRecent/open/create` 恢复会话文件并创建实例；已存在则**复用**（事件订阅按连接分发，多个连接可同时看同一会话）
- 切换/新建/删除会话 → 注册表同步移除/替换，旧实例 `dispose()`（中止进行中的 run、清空事件监听）
- 不同会话可并行（多标签页互不干扰）；模型（API key）全局共享，所有会话同一模型
- 事件订阅绑定在具体实例上，重建后需重新 `subscribe`（测试项目 `forwardEvents` 已实现此模式）
- **为什么必须单实例（评审发现）**：SessionManager 无文件锁，两个连接同开一会话 = 两个内存副本，一方全文件重写会把另一方消息整体覆盖丢失。注册表同时解决"删除会话后他连接复活已删文件"问题
- ⚠️ **abort 语义边界**：`abort()` 中止进行中的 run，in-flight 业务写已提交则**不会回滚**——文档明示"中止不撤销已提交的写操作"，工具实现中对 signal 快速返回

### 4.3 WebSocket 协议（复用 pi-test 验证过的协议）

客户端 → 服务端：`prompt` / `steer` / `followUp` / `abort` / `list_sessions` / `new_session` / `switch_session` / `delete_session`
服务端 → 客户端：`sessions` / `session_ready` / `session_switched` / `session_deleted` / `error` / `agent_start` / `turn_start` / `turn_end` / `agent_end` / `agent_settled` / `queue_update` / `auto_retry_start` / `auto_retry_end` / `message_update`（`text_delta`/`thinking_delta`）/ `tool_execution_start|update|end`

历史渲染模型：`toRenderMessages()` 把 AgentMessage 转成 `{ role, text, thinking, toolCalls[] }`（toolResult 按 toolCallId 关联）。

### 4.4 前端 `apps/web`（/ai 路由）

- 页面结构：`/ai` 页面内**二级会话侧边栏**（新建/切换/删除会话列表，pi-test 布局模式）+ 聊天主区；全局侧边栏只留「宁序」入口。
- 聊天界面：流式渲染、**Markdown 渲染用 `streamdown`**（Vercel 官方，react-markdown 的流式替代品，基于 shadcn/ui 设计系统；安装需在 Tailwind v4 globals.css 加 `@source` 行，monorepo 相对路径指到根 node_modules）、thinking **默认折叠**可展开、工具调用卡片（参数/结果/状态）、停止/打断（steer）、发送。
- 状态管理：`features/ai/` 内 **zustand store** 管 WS 连接/消息流/会话列表（组件只消费，项目已有 zustand 先例）。
- 语音输入：**不做内置语音输入**——用户在系统输入法（手机/桌面）语音转文字后直接发送。
- 认证与安全：WebSocket 连接携带 session cookie（浏览器），跨域 WS（pages.dev → api.zeroicey.me）**必须校验 `Origin` 头 ∈ {`CORS_ORIGIN`, `WEBAUTHN_ORIGINS`} 白名单，不符拒绝升级**（硬性要求，防跨站 WebSocket 劫持 CSWSH——生产 cookie 为 `SameSite=None`，浏览器对 WS 握手不做 CORS 预检，无 Origin 校验则任意网站可带用户 cookie 建立读写通道）。

### 4.5 部署

- `services/api/package.json` 新增 `@earendil-works/pi-coding-agent` + `typebox` 依赖。**镜像体积实测膨胀 +150~250MB**（pi-coding-agent 15M + pi-ai + 各 provider SDK 硬依赖 + photon-node wasm 等，原型 node_modules 199MB），release runbook 注明。
- 容器内新增模型凭据 env：`OPENCODE_API_KEY`（pi-ai 支持环境变量认证，无需 auth.json）；`PI_MODEL` 覆盖模型。
- AI 会话目录：**独立卷 `/data/sessions`**。Dockerfile 需补 `mkdir -p /data/sessions && chown -R serenique:serenique /data/sessions`（与 /data/blobs 同模式，否则命名卷不继承属主）。
- `env.ts` 新增 `AI_SESSION_DIR`（zod 校验）；dev 默认值**不能**是 `/data/sessions`（Mac 无 /data），按 NODE_ENV 区分或 dev 默认项目内目录。
- `.env.example` + docker run 文档补 `OPENCODE_API_KEY`、`PI_MODEL`、`AI_SESSION_DIR` 及第二个卷挂载。
- 单进程内嵌（随 API 主镜像发布，无独立服务）。
- **缺模型凭据的失败策略**：生产 fail-closed（启用 AI 但无可用模型 → 启动报错），或按连接友好报错并记录——实施时选一。

## 5. 已定决策

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 内置 AI 调用方式 | 直接调用 API service 层（PI customTools + defineTool），不用 CLI/MCP |
| 2 | Agent 循环 | PI SDK 全权承担，不自己实现 |
| 3 | 会话存储 | PI SessionManager jsonl 文件（无新表），独立卷 `/data/sessions` 持久化；删除 = unlink 文件 |
| 4 | 工具权限边界 | customTools 白名单 + `excludeTools` 排除 7 个内置工具（**不用 `tools: []`**）；WS 走现有 auth 中间件 + Origin 白名单 |
| 5 | 确认弹窗 | 第一版不做 |
| 6 | Skills | 第一版不用，系统提示词 + 工具描述 |
| 7 | 模型凭据 | 默认 pin `opencode-go/deepseek-v4-flash`，`OPENCODE_API_KEY` env 注入，`PI_MODEL` 可覆盖 |
| 8 | 全局配置隔离 | SettingsManager.inMemory + noExtensions/noSkills/noContextFiles + systemPromptOverride（须返回真实提示词） |
| 9 | 前端占位 | apps/web `/ai` 已存在（宁序），替换为真实聊天页 |
| 10 | 会话实例模型 | 进程内同会话单实例注册表（防并发写坏 jsonl），不同会话并行 |
| 11 | WS 安全 | Origin 白名单校验（防 CSWSH），index.ts 挂载 createBunWebSocket |
| 12 | exports.ts | 不导出 aiService（无消费方，避免拖入 pi 依赖） |

## 6. 待确认问题（下一步讨论）

1. ~~会话持久化目录~~ ✅ 已定：独立卷 `/data/sessions`
2. ~~生产模型~~ ✅ 已定：`opencode-go/deepseek-v4-flash` 默认（opencode 网关，`OPENCODE_API_KEY`），`PI_MODEL` 可覆盖
3. ~~工具范围~~ ✅ 已定：task/event 全量 CRUD + moment 查询/创建，含删除类工具；2026-08-10 扩展：任务组补齐、闪念 update/delete、标签全量 + 绑定、评论全量 CRUD（32 个工具）
4. ~~语音输入~~ ✅ 已定：不做，输入法自带语音转文字
5. ~~会话实例模型~~ ✅ 已定：进程内同会话单实例注册表
6. ~~前端聊天页~~ ✅ 已定：二级会话侧边栏 + streamdown（Vercel）+ zustand store + thinking 默认折叠
7. 生产缺模型凭据的失败策略：fail-closed vs 按连接报错（实施时选一）
