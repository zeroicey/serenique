# AI 智能体团队（Multi-Agent Team）决策

日期: 2026-08-06

适用范围: 全仓开发协作方式（队长 + 领域专家子代理）

## 背景

项目已横跨多个端：API、MCP、CLI、Web、Docker/CI 部署，移动端（Flutter）规划中。单一需求往往同时触及多个子系统（例如新增模块要动 API 契约 + MCP 工具 + CLI 命令 + Web 页面）。单一 Agent 全栈处理容易顾此失彼、上下文拥挤，且各端技术栈约束无法沉淀。

## 决策

采用「队长 + 领域专家 Agent」：主会话即队长，负责拆解/派发/验收；六个领域专家以 `.claude/agents/*.md` 子代理形式存在（api / mcp / cli / web / deploy / flutter），可并行派发。

- **权限**：所有 Agent 省略 `tools` 字段，继承全部工具，与队长一致——只是领域不同。
- **技术栈**：每个 Agent 的 prompt 明确限定为该项目当前技术栈，避免通用性导致的误用。
- **记忆**：每个 Agent 强制「动工前读 `.ai/`、完成后写 worklog」，保证记忆沉淀。
- **契约对齐**：跨端联动的锚点是 `services/api` 工作区源码（字段名、响应结构、`exports.ts` 导出面）；队长负责在派发时声明契约，避免并行时各自跑偏。

**Why**：领域专家把各自技术栈的硬约束（如 CLI 的 stdout 纯净/退出码、API 的 Res/AppError、Web 的 Query 纪律）固化在 prompt 里，比每次重新交代更可靠；并行派发缩短跨端改动的墙钟时间。

**How to apply**：队长在收到需求时，先拆解出受影响子系统，再并行派发对应 Agent；新 Agent 名必须注册进 CLAUDE.md 的团队表与 `.claude/agents/README.md`。Agent 的模型默认继承会话模型，可 per-agent 固定。

## 已否决选项（一句话）

- 单一全能 Agent：上下文拥挤、容易用错技术栈约束。
- 每次动态生成 Agent（无固定 prompt）：硬约束无法沉淀。
- 队长也做成子代理：队长需要全会话上下文做决策与验收，保持为主会话。
