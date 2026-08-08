# 2026-08-09 — 提示词与 Agent 配置统一 MCP 停更口径

08-08 已做出 MCP 停更决定（`.ai/decisions/2026-08-08-mcp-sunset.md`），但停更后的会话仍主动修改 `services/mcp`（08-09 曾删 MCP diary 工具、为 task dueDate 改 `task.tools.ts`）。排查发现：停更决定只存在于 `.ai/decisions/`，而会话启动必读的 AGENTS.md / CLAUDE.md 及全部 agent 提示词仍把 MCP 描述为活跃子系统，指令冲突时 AI 优先遵循 AGENTS.md。

## 改动（未提交，等船长统一收尾）

- **AGENTS.md / CLAUDE.md**（两份镜像同步）：项目概览与 monorepo 布局标注 `services/mcp` frozen；团队表 MCP Agent 行改「disabled / do not dispatch」；派发规则示例去掉 MCP 并写明「`services/mcp` 永远不是受影响子系统，AI 工具暴露需求走 CLI 或 API 层」；`services/mcp` 章节整体改写为停更横幅（不维护、不构建、不部署、不修改、不要「保持可编译」）；workspace exports 与字段陷阱段落删去 MCP 消费面表述；发布段落注明 MCP 镜像不再构建/推送
- **`.opencode/agents/mcp-agent.md`**：frontmatter 加 `disable: true`，description 改为「DISABLED / 停用」，正文顶部加停用横幅，原内容标注「历史内容仅供追溯」
- **`.claude/agents/mcp-agent.md`**：同上（Claude Code agent frontmatter 无 `disable` 字段，仅靠 description + 横幅停用）
- **`.opencode/agents/README.md` / `.claude/agents/README.md`**：成员表 MCP Agent 行标注停用；拆解步骤示例「API + MCP + CLI + Web」改「API + CLI + Web」并写明 MCP 冻结
- **`api-agent.md`（opencode + claude）**：description 的「MCP 消费契约」改「跨端（CLI/Web）契约」；「MCP 依赖它」「被 MCP `.extend()`/`.shape`」等 4 处约束去掉 MCP 指向
- **`deploy-agent.md`（opencode + claude）**：Docker Hub 命名空间改为只推 `serenique-api`（`.claude` 侧此前已更新部分）

## 验证

- `grep -rni "mcp" AGENTS.md CLAUDE.md .opencode/agents/*.md .claude/agents/*.md` 复核：残留提及均为事实性描述（typecheck/bun test 命令、Dockerfile 默认值）或冻结横幅内，无一处把 MCP 当活跃服务
- 需重启 opencode 后 `disable: true` 与 description 才生效（配置不热加载）

## 坑 / 对下一次会话的提示

- **根因教训**：状态变更（停更/废弃）只写决策文档不够——必须同步所有会话启动指令（AGENTS.md/CLAUDE.md）与 agent 提示词，否则 AI 优先遵循旧口径。决定后的首个会话要自查是否违规
- opencode 与 Claude Code 两套 agent 目录（`.opencode/agents/` 与 `.claude/agents/`）内容各自独立，改提示词时两份都要动；`.claude` 侧 frontmatter 无 `disable` 字段
- 工作区遗留：`services/mcp/src/tools/task.tools.ts`（已修改，未提交）+ `services/mcp/smoke-dueDate.ts`（未跟踪）——违反冻结的残留改动，待船长决定回滚
