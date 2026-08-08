# 项目记忆（.ai/）

Serenique 的项目记忆，正式文档。进 `.ai/` 前先读本文件。

## 目录职责

| 目录 | 职责 | 生命周期 |
|------|------|---------|
| `worklog/` | 每日流水账：做了什么、验证、坑、「对下一次会话的提示」 | 永久保留，权威历史 |
| `decisions/` | 决策记录（ADR）：Why / How to apply，含拒绝/延期项 | 永久保留 |
| `requirements/` | 需求文档，头部状态行：✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决 | 状态总表见 `requirements/README.md` |
| `architecture/` | 当前有效的架构/设计文档；被取代的加「已被 XX 取代」横幅 | 过期进 `archive/` |
| `runbooks/` | **标准流程手册，唯一事实源**（部署/上传/装机/构建/发布） | 流程变化时原地更新 |
| `archive/` | 死文档（实施完的 plan、被取代的设计） | 只进不出 |
| `inbox/` | memory 插件自动捕获的原始会话片段 | 由记忆 skill 消化后清空 |

## 规则

1. **标准流程只在 `runbooks/`**：worklog 发现可复现流程 → 写 runbook + worklog 留一行指针，不重复收录。
2. **自动捕获**：4 类场景由 `remember-*` skill 自动触发（见 `.opencode/skills/`）；插件把会话片段写入 `inbox/`。
3. **先去重再写**：同主题文档已存在 → 更新不新建。
4. **收尾动作**：写完任何记忆 → 更新本文件相关条目 + 清空已消化的 `inbox/` 片段。

## 索引

- runbooks：`hpcore-deploy.md`、`web-cloudflare-deploy.md`、`ios-device-install.md`、`docker-local-build.md`、`release-process.md`、`cn-access-hcyj.md`（国内加速入口）
- requirements 状态：见 `requirements/README.md`
- 最新决策：`decisions/`（按日期倒序）
- 最近工作：`worklog/`（按日期倒序）
