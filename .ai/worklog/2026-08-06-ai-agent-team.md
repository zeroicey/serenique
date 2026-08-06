# 2026-08-06 AI 智能体团队搭建

## 做了什么

- 建立 `.claude/agents/` 六名领域专家 Agent：api / mcp / cli / web / deploy / flutter
- 每份 prompt 按 Claude Code 子代理规范写：frontmatter（name/description）+ 技术栈限定 + 职责 + 硬约束 + 工作流程 + 项目记忆纪律
- 权限：省略 `tools` 字段 = 继承全部工具（与队长一致；`tools: "*"` 不是合法取值，勿用）
- 团队章程 `.claude/agents/README.md`（队长工作流 + 派发规则 + 共同规则）
- CLAUDE.md 新增「AI 智能体团队」章节
- 决策记录 `.ai/decisions/2026-08-06-ai-agent-team.md`

## 对下一次会话的提示

- 队长 = 主会话，不要把自己做成子代理。
- 派发时先在 `services/api` 源码里锁定契约（字段名/响应结构/exports 面），再并行派发。
- Agent 的 `model` 默认继承会话模型；如需固定改各自 frontmatter。
- 新增 Agent 记得更新 CLAUDE.md 团队表与 `.claude/agents/README.md`。
- 子代理 `tools` 字段不支持 `"*"` 通配（GitHub issue anthropics/claude-code#53865）；要全工具就省略该字段。
