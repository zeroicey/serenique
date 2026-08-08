# 2026-08-08 — audit（服务端日志）模块生产部署

将 audit 模块部署到 hpcore。需求文档：`.ai/requirements/2026-08-08-audit-module.md`。

## 步骤

1. **推送 main → GitHub**：17 commits（audit API 模块 + CLI `serenique logs` + 存量测试修复 `8270ebf`）。
2. **部署 API 镜像**：本拟「本地构建 → scp → docker load → compose up」。但本机是 **arm64 Mac**，默认 `docker build` 产出 **linux/arm64** 镜像，生产 hpcore 是 **linux/amd64** → `serenique-api` 容器 `Restarting (255)` 崩溃循环（平台不匹配）。
   - 恢复：main push 已触发 GitHub Actions docker-publish 构建多架构 `zeroicey/serenique-api:main`（含 amd64）。直接在服务器 `docker pull zeroicey/serenique-api:main` → `docker tag zeroicey/serenique-api:main zeroicey/serenique-api:latest` → `docker compose up -d api`。服务恢复 healthy，新代码上线。
   - **对下一次会话的提示**：给 hpcore 构建镜像必须 `docker build --platform linux/amd64`（生产 amd64）；本机默认 arm64 会崩。恢复手段：服务器 `docker compose pull` 旧 `latest`，或拉 CI 构建的 `:main` 后 tag 成 `latest`。
3. **数据库迁移**：应用 `services/api/drizzle/0009_add_audit_logs.sql`（CREATE TABLE `audit_logs` + 3 个 DESC 索引），记入 `drizzle.__drizzle_migrations` **id=10**（hash=sha256(整文件)=`2935bd80…ee8e4c`，when=`1786131862124`）。应用方式沿用 08-05/08-06：本地文件经 stdin 直灌 `docker exec -i postgres psql -U serenique -d serenique`，迁移记录用 heredoc INSERT（引号坑：SQL 字面量用单引号、经 stdin 传）。

## 验证

- `/` 元信息 `modules` 含 `"audit"`；`/api/audit/logs` 未带凭证返回 401（路由已注册且受认证保护）。
- 容器 `serenique-api` `Up (healthy)`，`/health` 200；mcp 不受影响。

## 说明

- audit 表为空表，等登录/删除/上传事件触发后写入。
- CLI `serenique logs` 已按契约实现（`b8f629a`），对已部署 API 可用。
- 并发：部署期间有并行会话在提交 web/mobile audit 前端，与本部署无冲突。

> 标准流程已抽到 `.ai/runbooks/hpcore-deploy.md`，本文件保留事件记录。
