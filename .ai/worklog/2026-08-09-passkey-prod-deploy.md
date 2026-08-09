# 2026-08-09 — Passkey 认证重构 v0.5.0 生产部署（API + Web + CLI）

将 Passkey 认证重构（v0.5.0）全栈发布：后端 → hpcore，前端 → Cloudflare Pages，CLI → GitHub Release。本机验证全绿后按 runbook 走完三步发布 + 手动迁移。**未写任何 secret 值到仓库/日志。**

## 发布前

- 提交 `d70868f`（docs: record flutter passkey research worklog，未提交的调研文档收尾）。
- 全量验证：根 `bun run typecheck` ✓；api `bun test` 267 tests（153 pass / 114 skip / 0 fail）✓；cli `go build ./... && go vet ./... && go test -count=1 ./...` 4 包全绿 ✓。

## 后端（API → hpcore）

- push main（经本机代理 7897）→ docker-publish run `31302078324` success。
- 镜像 digest：`sha256:0c513c7f7c46cea115efaa4b56c82ecbd3f53e99d53f774f026d411f08372e77`（CI 日志与服务器 pull 后 inspect 一致，无加速器缓存坑）。
- hpcore `.env`：备份 `.env.bak.20260809155250` → 追加 `SESSION_SECRET`（`openssl rand -hex 32`）、`SETUP_TOKEN`（`openssl rand -hex 24`）、`WEBAUTHN_RP_ID=serenique.0icey.icu`、`WEBAUTHN_RP_NAME=Serenique`、`WEBAUTHN_ORIGINS=https://serenique.0icey.icu`（值只存在服务器，此处不记录）。
- pull `:main` → tag `latest` → `docker compose up -d --force-recreate api`（输出 Recreated，非缓存假象）。
- **手动迁移 0014_rapid_stone_men.sql**（scp 到 `~/serenique-deploy/`，服务器 sha256 与本地一致）：3 张表 + FK + 索引全部 CREATE；记录进 `drizzle.__drizzle_migrations` id=15，**hash=`450a3cddc0917b503a9be0f3d928ba1f9444a958abebfaf9169df23afc52ebea`**（sha256 整文件），created_at=1786257620815（journal.when）。
- **删除 .env 的 `AUTH_TOKEN`** → `docker compose up -d --no-deps api` 重建。
- 验证：容器 healthy；`localhost:3000/health` 与 `https://api.zeroicey.me/health`、`https://api.hcyj.xyz/serenique/health` 均 `{"status":"ok"}`；`/` modules 列表含新 `auth`/`tokens`；**未带凭证 `/api/auth/me` → 401 UNAUTHORIZED**（门禁生效）。

## Web（Cloudflare Pages）

- `VITE_API_BASE_URL=https://api.hcyj.xyz/serenique bun run build` ✓ → `bunx wrangler pages deploy dist --project-name=serenique-web`（27 files，`_redirects` 已传）。
- 验证：`https://serenique.0icey.icu/moment` 与 `https://serenique-web.pages.dev/moment` 均 200 text/html；懒加载 chunk `unwrap-jkYFsgkB.js` 含 `api.hcyj.xyz`（runbook 提示：别在主 index bundle grep，且 minified 字符串是转义形式，按 `hcyj` 关键字搜）。

## CLI（GitHub Release v0.5.0）

- `git tag -a v0.5.0` + 代理推送 → docker-publish（`31302377624`）与 release-cli（`31302377625`）均 success。
- **Release: https://github.com/zeroicey/serenique/releases/tag/v0.5.0** — 资产 = checksums.txt + darwin-amd64/arm64 + linux-amd64/arm64 + windows-amd64.exe（5 平台）。
- Docker Hub：`zeroicey/serenique-api` 的 `v0.5.0` / `0.5.0` / `latest` 均存在。

## 坑 / 对下一次会话的提示

- **ssh 直连 hpcore 偶发超时**：`ssh -J hpazure hpcore` 第一次 60s 无响应（中国→Azure 不稳），重试 + `-o ConnectTimeout=25 -o ServerAliveInterval=15` 即好；scp 同样适用。非部署缺陷。
- **compose 文件名是 `compose.yml` 不是 compose.yaml**（08-05 worklog 已记，本次又踩一次）。
- **minified JS 里 API base 是转义字符串**：`grep 'api\.hcyj\.xyz'` 匹配不到，用 `grep -c hcyj` 全量 chunk 扫；base 在懒加载 `unwrap-*.js`，主 bundle 没有（runbook 已记，本次验证再确认）。
- 迁移 hash 记录用**整文件 sha256**（与本地 `shasum -a 256` 一致），服务器 `sha256sum` 交叉验证后写入；`created_at` 取 `_journal.json` 的 `when`（1786257620815）。
- 先加新 env 键、跑通新镜像后再删 `AUTH_TOKEN`，两段式重建可最小化停机窗口。

> 标准流程已抽到 `.ai/runbooks/hpcore-deploy.md`（新增「Passkey 环境变量」段），本文件保留事件记录。
