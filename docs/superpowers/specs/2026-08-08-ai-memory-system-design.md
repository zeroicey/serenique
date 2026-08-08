# Serenique AI 记忆系统重构设计

- 日期：2026-08-08
- 状态：设计已批准，待实施
- 适用范围：`.ai/`（项目记忆）、`.opencode/`（skills + plugin）、`AGENTS.md`

## 背景与问题

`.ai/` 目前是 5 个目录（worklog / architecture / decisions / requirements / issues），存在三个问题：

1. **标准流程缺失**：部署、Web 上传、手机装机等可复现流程散落在 15+ 个 worklog 里，同一流程（如 hpcore 部署的 digest 校验坑）被记录多次且互相独立，新会话需读多个文件才能拼出完整流程。
2. **分类混杂**：`architecture/` 混有三种东西（架构文档、feature 设计稿、实施完的超长 plan，其中 `web-moment-feature-plan.md` 1845 行）；`requirements/` 无状态管理（`moment-tags` 无任何实施记录，但不读文件无法得知其状态）；`architecture/` 与 `decisions/` 内容重叠；无索引文件。
3. **无自动捕获机制**：记忆完全依赖 agent 自觉写 worklog，用户与 agent 讨论的需求、临时决策、踩坑解法容易丢失。

## 目标

`.ai/` 从"被动归档"升级为**自动捕获的记忆系统**，覆盖 4 类捕获场景：

| # | 场景 | 捕获产物 |
|---|------|---------|
| 1 | 遇到新困难并自己解决 | worklog（坑 + 解法） |
| 2 | 完成珍贵/难的需求或流程 | worklog + runbook |
| 3 | 与用户讨论需求时 | requirement |
| 4 | 做出决策时 | decision |

实现机制分层：

- **skill**：主角。description 写死触发条件 → 模型在场景出现时自动加载 → 模板保证格式一致
- **plugin**：机器级兜底。事件驱动捕获原始会话片段到 `inbox/`，会话结束自动积累
- **AGENTS.md**：纪律。4 类触发场景写成显式规则，与 skill 互相印证

## 方案

### 1. `.ai/` 目录结构

```
.ai/
├── README.md              ← 新增：总索引 + 各目录职责 + 生命周期规则（进 .ai 先读它）
├── worklog/               ← 保持不动：每日流水账 +「对下一次会话的提示」，权威历史
├── decisions/             ← 保持不动：ADR 格式（Why/How to apply）已是标杆
├── requirements/          ← 保持 + 头部状态行 + README 状态总表
├── architecture/          ← 收缩：只保留当前有效的；被取代的加「已被 XX 取代」横幅
├── runbooks/              ← 新增：标准流程手册，唯一事实源
├── archive/               ← 新增：死文档归档
└── inbox/                 ← 新增：插件自动捕获的原始片段，由记忆 skill 消化后清空
```

**runbooks/ 首批内容**（从 worklog 抽取，worklog 保留事件记录 + 指向 runbook 的指针）：

| 文件 | 内容 | 来源 |
|------|------|------|
| `hpcore-deploy.md` | 服务器部署/更新/回滚（digest 校验、`--force-recreate`、镜像加速器缓存坑） | 4 个 worklog 重复记录 |
| `web-cloudflare-deploy.md` | Web 构建+上传（`VITE_API_BASE_URL`、wrangler） | 2 个 worklog |
| `ios-device-install.md` | 手机装机/重装（release 构建 + devicectl） | 1 个 worklog 第 33 行 |
| `docker-local-build.md` | 本机 Docker 构建（代理 build-args） | worklog + AGENTS.md |
| `release-process.md` | 打 tag 发布流程 | 2 个 worklog + AGENTS.md |

**archive/ 首批内容**：`2026-08-05-web-moment-feature-plan.md`、`2026-08-06-web-event-feature-plan.md`（实施完的任务清单）。

**requirements 状态约定**：头部状态行 `状态：✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决`；`requirements/README.md` 状态总表。现有 9 个文件补状态行（`moment-tags` 无实施记录 → ⏳待实施）。

**迁移原则**：worklog/decisions 一个文件不动（零链接破坏）；只新增目录 + 挪 2 个 plan + 补状态行和横幅。

### 2. 记忆 skill（`.opencode/skills/remember-*/SKILL.md`）

| Skill | 触发条件 | 写入位置 |
|-------|---------|---------|
| `remember-worklog` | 完成实现/修复/部署/评估，会话收尾 | `.ai/worklog/YYYY-MM-DD-<主题>.md` |
| `remember-decision` | 选了/拒绝某方案、改变既有约定 | `.ai/decisions/YYYY-MM-DD-<主题>.md` |
| `remember-requirement` | 讨论阶段用户提出新功能/变更需求 | `.ai/requirements/YYYY-MM-DD-<主题>.md` |
| `remember-runbook` | 走通新流程/踩坑修复/worklog 出现重复流程描述 | `.ai/runbooks/<主题>.md` |
| `memory-consolidate` | 手动调用（整理 inbox） | 分散到正式位置 |

每个 skill 固定 4 段：触发条件、先去重再写（同主题已存在 → 更新不新建）、模板、收尾动作（更新 `.ai/README.md` 索引 + 清空已消化的 inbox 片段）。

### 3. memory 插件（`.opencode/plugin/memory.ts`）

- 自动发现（`.opencode/plugin/*.ts`），无需注册
- 订阅事件总线：`session.idle`（agent 一轮结束）、`message.updated`（含工具调用信息）
- **捕获规则**：`session.idle` 时若该轮发生过文件编辑（edit/write 工具调用），追加一行摘要到 `.ai/inbox/YYYY-MM-DD.md`——时间、会话标题、改动文件、消息预览
- **分组**：同一会话的多轮捕获归到同一标题分组
- **不越权**：只写 `inbox/` 原始片段，不做分类/归档判断（skill 的职责）

闭环：插件自动捕获 → `memory-consolidate` skill 消化 → 清空 inbox。

### 4. AGENTS.md 更新

- 新增「项目记忆纪律」小节：4 类自动触发场景显式规则
- `.ai/` 描述更新：新目录 + 规则"标准流程只在 runbooks/，worklog 不重复收录"
- **瘦身**：Docker 构建代理、发布流程等操作步骤改为一行指针指向 runbooks；CLI 硬契约等代码契约保留（那是常量）

## 迁移步骤

1. 新建 `runbooks/`、`archive/`、`inbox/` 目录和 `.ai/README.md`
2. 从 worklog 抽取 5 个 runbook；被抽取的 worklog 加指针行
3. 移动 2 个 plan 到 `archive/`
4. 9 个 requirement 文件补状态行 + `requirements/README.md` 状态总表
5. 编写 5 个记忆 skill
6. 编写 `.opencode/plugin/memory.ts`
7. 更新 AGENTS.md（纪律 + 指针 + 瘦身）
8. 验证：插件不报错、skill 可被加载、typecheck 通过

## 非目标

- 不做外部记忆系统（Mem0 等）——个人项目收益为负
- 不动 `worklog/`、`decisions/` 现有文件
- 不做 CI 集成（部署自动化另议）
- 不动 `.ai/issues/`（保留，低频目录）

## 验证方式

- `bun run typecheck`（插件 TS 类型）
- opencode 重启后 `session.idle` 触发能生成 inbox 片段
- skill 列表出现 5 个新 skill（`/skill` 或 TUI 可查）
- 抽查：新会话按 AGENTS.md 纪律能正确落到 runbooks / requirements
