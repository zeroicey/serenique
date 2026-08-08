# Serenique AI 智能体团队

本目录存放 Serenique 的领域专家 Agent（opencode 子代理规范）。**队长 = 主会话（opencode build agent）**，负责拆解需求、派发任务、对齐契约、验收与集成。

## 成员

| Agent | 文件 | 领域 | 触发信号 |
|---|---|---|---|
| API Agent | `api-agent.md` | `services/api`（Bun + Hono + Drizzle） | REST 端点、表/迁移、服务层、校验、测试、`exports.ts` |
| MCP Agent | `mcp-agent.md` | `services/mcp`（MCP SDK + streamable-http） | 新工具、工具暴露面、把 service 能力接入 AI |
| CLI Agent | `cli-agent.md` | `apps/cli`（Go + cobra） | 命令功能、新增模块、配置、输出、传输 |
| Web Agent | `web-agent.md` | `apps/web`（React 19 + Vite + shadcn/ui） | 页面、路由、feature、表单、服务端状态 |
| Deploy Agent | `deploy-agent.md` | Docker / GitHub Actions / 发布 | 镜像、compose、CI 工作流、tag 发布、服务器 |
| Flutter Agent | `flutter-agent.md` | 移动端 Flutter（规划中，iOS/Android） | 移动端需求、移动端架构设计 |

## 队长工作流（opencode）

1. **拆解**：理解需求，识别受影响子系统（一个需求常跨多个端，如新增模块 → API + MCP + CLI + Web）
2. **定契约**：以 `services/api` 工作区源码为锚点锁定跨端契约（字段名、响应结构、`exports.ts` 导出面）
3. **派发**：对受影响子系统**并行**派发对应 Agent——同一消息内发起多个 Task 工具调用（`subagent_type` 指向 `*` 前缀即本目录的 agent 名）即并行
4. **验收**：核对各 Agent 返回的改动与契约一致；跑各端验证（typecheck / test / build）
5. **集成与收尾**：统一合并、补充跨端同步改动（如字段改名）、写 `.ai/worklog/`

## 调用方式

- **子代理派发**：队长通过 Task 工具 `subagent_type: "api-agent"` 等调用；任务完成后返回单一总结消息
- **手动调用**：对话中 `@api-agent` 直接触发（@ 自动补全列出全部子代理）
- **模型**：缺省继承主代理模型；如需固定，在各自 frontmatter 改 `model: <provider>/<model-id>`

## 共同规则（已内建于每个 Agent 的 prompt）

- **权限**：所有 Agent 不写 `permission` 字段 = 继承全部工具（与队长一致）；需要只读时加 `permission: { edit: deny }`
- **技术栈**：各自 prompt 限定为当前项目各端技术栈
- **记忆**：动工前读 `.ai/architecture|decisions|worklog` 最新文档；完成后写 worklog 沉淀坑与提示
- **语言**：用户可见文案一律中文
- **契约源**：跨端字段以 `services/api` 源码为准，不照抄运行中容器的输出
