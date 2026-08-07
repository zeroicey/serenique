# MCP 服务停更（MCP Sunset）

日期: 2026-08-08

适用范围: `services/mcp`（MCP 服务器，streamable-http）

## 背景

`services/mcp` 是暴露 API 服务层给 AI 智能体的 MCP 服务器。经评估后决定**停更停用**：不再维护、不再更新、不再随发布构建。

## 决策

1. **停更**：`services/mcp` 冻结，不再改动。范围仅限 API（`services/api`）与 CLI（`apps/cli`）；MCP 不更新。
2. **停用**：生产服务器与本地 Docker 的 MCP 服务全部停止。
3. **发布**：后续 docker 发布构建**不再构建/推送** MCP 镜像（停用且不更新则不会自动出新版本，属预期）。
4. **保留**：代码保留在仓库（不删除），`docker-publish.yml` 的 mcp 相关步骤保留但不主动触发（或后续删除，届时再评估）。

## Why

- MCP 服务的维护收益低于成本：AI 智能体可通过 CLI（`apps/cli`）或直接调用 API 服务层完成同等能力，MCP 作为独立服务额外引入构建、部署与版本负担。
- 停更后只需保证 API + CLI 契约稳定（CLI 硬契约见 CLAUDE.md CLI 模块），不维护 MCP 消费面。

## How to apply

- **运维**：生产 `ssh -J hpazure hpcore` → `cd /srv/compose/serenique && docker compose stop mcp`；本地 `docker compose stop mcp`。
- **发布**：手动构建镜像时只构建 `serenique-api`；不触碰 `serenique-mcp` 构建步骤（`docker-publish.yml` 停更后不主动触发）。
- **记忆**：后续会话不要为 MCP 安排需求/修复；涉及「AI 工具暴露」的需求改为「CLI 或 API 层」。
