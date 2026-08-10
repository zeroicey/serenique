# 2026-08-10 — 换回 Claude Code：更新入口文件 + 配置记忆自动捕获

背景：2026-08-08 起因 AI 额度改用了 Open Code（`.opencode/` + `AGENTS.md`）。今天额度恢复，切回 Claude Code。Open Code 侧的一切（`AGENTS.md`、`.opencode/`）**保持不动**，仅更新 Claude Code 自身的入口与配置。

## 改动（未提交）

- **`CLAUDE.md`**：以 `AGENTS.md` 为最新事实源全面更新（但 `.opencode/` 引用全部换成 `.claude/`，且以实际代码为准修正了 AGENTS.md 里过时的路由表/模块表）：
  - 新增 AI 助手模块（宁序，`/api/ai/ws` WS + PI SDK agent loop + jsonl 会话）
  - `.ai/` 记忆系统补全（requirements/runbooks/archive/inbox + 自动捕获纪律 + 英文 commit 规范）
  - 认证模型改写：bootstrap-user.ts 建用户、凭证计数门控、删除公开注册、登录 counter 单调校验、审计日志
  - 路由表按代码重写：删除已移除的 diary，新增 ai/audit/tag/tokens、凭证重命名、moment tags
  - Docker：AI env（`OPENCODE_API_KEY`/`AI_MODEL`）+ `/data/sessions` 卷
- **`.claude/settings.json`**（新）：注册 `SessionStart` + `Stop` hooks
- **`.claude/hooks/load-memory.mjs`**（新）：SessionStart 读 `.ai/README.md` + 最近 worklog + 未消化 inbox，注入上下文（等价 Open Code「开始读」）
- **`.claude/hooks/capture-inbox.mjs`**（新）：Stop 把每轮实质 assistant 消息捕获到 `.ai/inbox/YYYY-MM-DD.md`（等价 Open Code memory 插件「写完存」）
- **`.claude/skills/`**（新）：移植 `remember-worklog/runbook/requirement/decision` + `memory-consolidate` + `image-recognition`（vision.js + .env.example）
- **`.ai/README.md`**：把 `.opencode/skills/` 引用改为 `.claude/skills/`

## 验证

- 两个 hook 脚本端到端测试通过：capture 追加/去重/transcript 回退/短文本+tool_use 绕过；load-memory 输出摘要；settings.json 命令 shell 展开正常
- 6 个 skill frontmatter 校验通过，且已被 Claude Code 加载（Skill 列表可见）
- `.claude/skills/image-recognition/.env` 被根 `.gitignore` 覆盖

## 坑 / 对下一次会话的提示

- **Stop hook 不要读 transcript 取本轮最终消息**——transcript 异步写入可能滞后，官方要求读 stdin 的 `last_assistant_message` 字段（本脚本已实现，transcript 仅作回退）
- hook 命令用 `"${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"` 定位仓库根，子目录启动也生效
- hook 脚本读 stdin 用 `readFileSync(0)` 会阻塞——已加 `process.stdin.isTTY` 防护（终端手动跑不挂起）
- capture 门槛 `MIN_LENGTH=80`：中文 80 字符不少，短文本但有 tool_use 的回合也会捕获
- 若 hook 未生效，用 `claude --debug-file /tmp/claude-hooks.log` 看 Stop 事件收到的完整 JSON 字段
