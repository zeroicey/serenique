# 2026-08-08 — 生产 .env 核对（安全确认）+ 根目录 docker-compose.yml 退役

用户要求两件事：① 核对 `.env.example` 与生产服务器 `/srv/compose/serenique/.env` 是否一致，若生产带着示例值就要立刻改（怕「完蛋」）；② 确认根目录 docker-compose.yml 是否已无用途、可否删除。

## ① 生产 .env 核对结论：生产安全，.env.example 自身有误

逐键核对（secrets 打码比对，不外泄）：

| 变量 | `.env.example` | 生产 hpcore | 结论 |
|------|----------------|-------------|------|
| AUTH_TOKEN | `change-me-…` 占位符 | 96 字符真实密钥 | 生产正确 |
| BLOB_SIGNING_SECRET | `change-me-…` 占位符 | 64 字符真实密钥 | 生产正确 |
| CORS_ORIGIN | **`http://`serenique.0icey.icu** | `https://serenique.0icey.icu` | **`.env.example` 写错** |
| DATABASE_URL | 127.0.0.1 示例 | 10.126.126.2 真实 DB | 生产正确 |
| SESSION_TTL / AUDIT_* | 注释缺省 | 未设置（用默认值） | 无碍 |

生产不用改。真正的雷在 `.env.example`：CORS_ORIGIN 是 `http://`，注释和生产都是 `https://`——照 example 拷去新部署必然登录被拦。

**用户决定**：`.env.example` 的 CORS_ORIGIN 改成 `https://example.com`（不放真实部署域名）。**git 历史抹除评估**：域名出现在 6 个 commit + 多个 worklog/runbook（.ai 是永久记忆），彻底抹除需重写全部 192 个 commit 并 force-push，且抹不干净（域名是公开线上站点，非敏感信息）→ 用户接受「算了」，只修当前文件。

## ② docker-compose.yml 退役（commit 待提交）

根目录 `docker-compose.yml` 删除。依据：CI（docker-publish.yml）与生产服务器都不用它（生产有自己的 `/srv/compose/serenique/compose.yml`）；本地已改为直接 `docker build -f services/api/Dockerfile .`。

同步更新引用（避免文档给失效指令）：
- `AGENTS.md` / `CLAUDE.md`：Commands 的 `docker compose up -d --build api mcp` → `docker build`；network note 改 `docker build --build-arg …`；Docker 章节改「无 compose、直接 build + docker run -e」并补 `-e AUTH_TOKEN` / `-e CORS_ORIGIN` 示例
- `.ai/runbooks/docker-local-build.md`：重写为直接 `docker build`（代理 build-args）+ `docker run` 流程；补「MCP 已停更，只构建 api」
- `.opencode/agents/deploy-agent.md` + `.claude/agents/deploy-agent.md`：去掉 compose 相关（描述/技术栈/验证项 `docker compose config`）
- `apps/cli/README.md`：blob link 的 `docker-compose.yml` 引用 → `.env.example`
- `.ai/decisions/2026-08-08-mcp-sunset.md`：本地 `docker compose stop mcp` → `docker stop <容器名>`（compose 已删）
- `services/api/docker-compose.test.yml` **保留**（集成测试 DB，`package.json` test:db:up/down 在用）

## 验证

- `git grep -l 'docker-compose\|docker compose'` 剩余命中均为合理项：历史 worklog/plans、生产 runbook（hpcore 确实用 compose）、测试用 `docker-compose.test.yml`
- 生产核对命令（下次可复用）：`ssh -J hpazure hpcore 'awk -F= '\''/^(AUTH_TOKEN|BLOB_SIGNING_SECRET)=/{...}'\'' /srv/compose/serenique/.env'`

## 坑 / 对下一次会话的提示

- **`.env.example` 是部署模板，值必须用通用占位（example.com），绝不写真域名/真密钥**——否则被拷去新部署就是事故。
- 改生产 `.env` 前先 `cp .env .env.bak.<时间戳>`，改后 `docker compose up -d --no-deps api`（详见 `.ai/runbooks/hpcore-deploy.md`）。
- 本地跑 API 容器：`docker build -f services/api/Dockerfile .` + `docker run -e`（键见 `.env.example`）；构建需代理 build-args（`.ai/runbooks/docker-local-build.md`）。
