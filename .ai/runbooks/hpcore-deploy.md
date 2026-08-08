# hpcore 生产服务器部署

**适用范围**：hpcore（Azure，Arch Linux，用户 `oicey`）。入口：`ssh -J hpazure hpcore`。Compose 项目在 `/srv/compose/serenique/`。生产跑 Docker Hub `latest` / `:main` 镜像。

## 前置条件

- 镜像已由 GitHub Actions 构建并推送（main push → `:main`；tag → `latest`）
- 生产 .env 在 `/srv/compose/serenique/.env`（0600），**改动前先 `cp .env .env.bak.<时间戳>`**
- secrets（DB 密码、`BLOB_SIGNING_SECRET`、`AUTH_TOKEN`）只在服务器 .env，**绝不写进 git / worklog / 日志**

## 更新镜像（正常流程）

```sh
cd /srv/compose/serenique && docker compose pull && docker compose up -d
```

## 坑：镜像加速器缓存旧 tag（2026-08-08 实测）

hpcore 的 `/etc/docker/daemon.json` 配了镜像加速器，**对 `:main` tag 缓存旧镜像**：

1. `docker pull` 可能返回「Image is up to date」但拿到的是旧 digest。
2. **核对 digest**：`docker inspect zeroicey/serenique-api:main --format '{{.RepoDigests}}'` 与 CI 日志（`gh run view <run> --log | grep containerimage.digest`）一致才说明是新镜像。
3. 不一致 → 用 digest 精确拉取绕过 tag 缓存：

```sh
docker pull zeroicey/serenique-api@sha256:<digest>
docker tag zeroicey/serenique-api@sha256:<digest> zeroicey/serenique-api:latest
docker compose up -d --force-recreate api
```

4. `docker compose up -d` 输出「Container Running」而非「Recreated」= 容器没换镜像，必须 `--force-recreate`。
5. 业务侧验证：真实请求验证行为（如 PUT 超长文本应过校验返回 404 而非 500）。

## 平台注意（amd64）

- 生产是 **linux/amd64**。本机是 arm64 Mac，`docker build` 默认产出 arm64 镜像，直接 scp/load 会 `Restarting (255)` 崩溃循环。
- 正确姿势：走 GitHub Actions 构建（多架构），服务器 `docker pull zeroicey/serenique-api:main` 后 tag 成 `latest`。
- 手动构建必须 `docker build --platform linux/amd64`。

## 回滚

- 服务器 `docker compose pull` 旧 `latest`，或拉 CI 构建的 `:main` 后 tag 成 `latest`。
- 改生产 .env 后 `docker compose up -d --no-deps api` 重建。

## 升级 schema（手动迁移）

服务器无 bun、npm registry 不可达，不能跑 `drizzle-kit migrate`：

1. 本地按 `drizzle/meta/_journal.json` 顺序取新增的 `<tag>.sql`（按 `--> statement-breakpoint` 切分）。
2. 经 stdin 直灌：`docker exec -i postgres psql -U serenique -d serenique < <迁移.sql>`（heredoc/stdin 传 SQL 最稳，**SQL 字面量用单引号**——多层 ssh 嵌套时双引号会被 PG 当标识符）。
3. 记迁移：`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256(整文件)>', <journal.when>);`（id 自增）。

## 公网链路（api.zeroicey.me）

- 路径：`api.zeroicey.me (hpazure) → Caddy:443 → 127.0.0.1:18081 → frps → frpc → hpcore:3000`。
- frpc 配置：`/home/oicey/apps/frp/conf/frpc-serenique.toml`（localPort=3000），`systemctl --user restart frpc-serenique`。
- Caddy 上游必须 `keepalive off`（`/etc/caddy/Caddyfile` reverse_proxy transport）——否则连接被 Bun API 重置后 Go transport 重试造成偶发 3–18s 慢请求。改前备份 `Caddyfile.bak.*`，`caddy validate` 后 `systemctl reload caddy`。
- 本机（中国网络）直连 Azure 公网 IP 不稳定（2–12s），经本机代理 7897 则 ~0.8s——基础设施线路问题，非部署缺陷。
- 服务器端口：API 对外 3000；MCP 对外 3002（3001 被 vocechat 占用）。
