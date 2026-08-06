# Serenique AI 智能体团队

本目录存放 Serenique 的领域专家 Agent（Claude Code 子代理规范）。**队长 = 主会话（Claude Code）**，负责拆解需求、派发任务、对齐契约、验收与集成。

## 成员

| Agent | 文件 | 领域 | 触发信号 |
|---|---|---|---|
| API Agent | `api-agent.md` | `services/api`（Bun + Hono + Drizzle） | REST 端点、表/迁移、服务层、校验、测试、`exports.ts` |
| MCP Agent | `mcp-agent.md` | `services/mcp`（MCP SDK + streamable-http） | 新工具、工具暴露面、把 service 能力接入 AI |
| CLI Agent | `cli-agent.md` | `apps/cli`（Go + cobra） | 命令功能、新增模块、配置、输出、传输 |
| Web Agent | `web-agent.md` | `apps/web`（React 19 + Vite + shadcn/ui） | 页面、路由、feature、表单、服务端状态 |
| Deploy Agent | `deploy-agent.md` | Docker / GitHub Actions / 发布 | 镜像、compose、CI 工作流、tag 发布、服务器 |
| Flutter Agent | `flutter-agent.md` | 移动端 Flutter（规划中，iOS/Android） | 移动端需求、移动端架构设计 |

## 队长工作流

1. **拆解**：理解需求，识别受影响子系统（一个需求常跨多个端，如新增模块 → API + MCP + CLI + Web）
2. **定契约**：以 `services/api` 工作区源码为锚点锁定跨端契约（字段名、响应结构、`exports.ts` 导出面）
3. **派发**：对受影响子系统**并行**派发对应 Agent（同一消息内多个 Agent 调用即并行）
4. **验收**：核对各 Agent 返回的改动与契约一致；跑各端验证（typecheck / test / build）
5. **集成与收尾**：统一合并、补充跨端同步改动（如字段改名）、写 `.ai/worklog/`

## 共同规则（已内建于每个 Agent 的 prompt）

- **权限**：所有 Agent 省略 `tools` 字段 = 继承全部工具（与队长一致）；`permissionMode` 默认继承会话设置
- **技术栈**：各自 prompt 限定为当前项目各端技术栈
- **记忆**：动工前读 `.ai/architecture|decisions|worklog` 最新文档；完成后写 worklog 沉淀坑与提示
- **语言**：用户可见文案一律中文
- **模型**：默认继承会话模型；如需固定，改各自 frontmatter 的 `model`
- **契约源**：跨端字段以 `services/api` 源码为准，不照抄运行中容器的输出
