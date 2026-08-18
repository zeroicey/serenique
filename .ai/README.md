# 项目记忆（.ai/）

Serenique 的项目记忆，正式文档。进 `.ai/` 前先读本文件。

## 目录职责

| 目录 | 职责 | 生命周期 |
| ------ | ------ | --------- |
| `worklog/` | 每日流水账：做了什么、验证、坑、「对下一次会话的提示」。新约定一天一个文件 `YYYY-MM-DD.md`（`##` 按主题）；历史遗留的主题式文件 `YYYY-MM-DD-<slug>.md` 保留不动 | 永久保留，权威历史 |
| `decisions/` | 决策记录（ADR）：Why / How to apply，含拒绝/延期项 | 永久保留 |
| `requirements/` | 需求文档，头部状态行：✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决 | 状态总表见 `requirements/README.md` |
| `architecture/` | 当前有效的架构/设计文档；被取代的加「已被 XX 取代」横幅 | 过期进 `archive/` |
| `runbooks/` | **标准流程手册，唯一事实源**（部署/上传/装机/构建/发布） | 流程变化时原地更新 |
| `archive/` | 死文档（实施完的 plan、被取代的设计、迁移归档） | 只进不出 |
| `inbox/` | 原始会话片段中转站（历史 hook 遗留 + 手动放置） | 由记忆 skill 消化后清空 |

## 规则

1. **标准流程只在 `runbooks/`**：worklog 发现可复现流程 → 写 runbook + worklog 留一行指针，不重复收录。
2. **记忆写入**：4 类场景由 `.pi/skills/` 的 `remember-*` skill 触发（worklog/decision/requirement/runbook）；先查重再写，同主题已存在 → 更新不新建。
3. **坑先写 worklog，踩两次升级**：用 `⚠️` 标记；同一坑被踩第二次 → 提炼进 `.pi/APPEND_SYSTEM.md`「已知陷阱」区。
4. **收尾动作**：有实质产出的会话结束 → 追加当日 `worklog/` + 清空已消化的 `inbox/` 片段。

## 自动注入与自动捕获（2026-08-15 迁移 pi 后）

- **注入（读方向，pi 扩展自动）**：`.pi/extensions/memory.ts` 在每轮开始前把近期记忆摘要注入系统提示——最近 worklog 主题 + `decisions/` 最新 ADR 标题 + 未消化 inbox 列表；摘要 ≤1.8KB 只给钩子，细节按需 read 原文。会话中写新记忆，下一轮自动刷新（mtime 指纹）。
- **捕获（写方向，context-mode 自动）**：context-mode 扩展自动记录事件级记忆（决策/错误/阻塞/意图/计划），用 `ctx_search` 检索；`.ai/` 正式文档仍由收尾规则人工沉淀（决策进 `decisions/`、产出进 worklog）。
- 分工：`ctx_search` 是廉价全量检索（原材料），`.ai/` 是结构化正式记忆（权威）；查询先 `ctx_search`，落正式记忆进 `.ai/`。

## 索引

- runbooks：`hpcore-deploy.md`、`web-cloudflare-deploy.md`、`ios-device-install.md`、`docker-local-build.md`、`release-process.md`、`cn-access-hcyj.md`（国内加速入口）
- requirements 状态：见 `requirements/README.md`
- 最新决策：`2026-08-18-ai-pagination-front-anchor.md`（懒加载分页游标 → 稳定前端边界 anchor）、`2026-08-08-production-cn-entry.md`（生产公网入口 → api.hcyj.xyz/serenique）、`2026-08-08-mcp-sunset.md`（见 `decisions/`，按日期倒序）
- 迁移归档：`archive/2026-08-15-agents-md-archive.md`（原 AGENTS.md / CLAUDE.md 全文）、`archive/2026-08-04-blob-storage-module-design.md`（blob 完整设计）
- 最近工作：`worklog/`（按日期倒序）
