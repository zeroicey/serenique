# 2026-08-05 — 服务器部署:hpcore 上线 API + MCP + CLI

将 serenique 部署到目标主机 `ssh hpcore`(Arch Linux, 用户 `oicey`, 在 `docker`/`wheel` 组)。遵循该服务器既有部署规范。

## 服务器部署规范(侦察结论)

- Compose 项目位于 `/srv/compose/<项目>/`,每个项目自带 `compose.yml` + `.env`(secrets 在 `.env`)。
- 持久数据按服务放 `/data/services/<服务>/`(serenique 的 blob 用命名卷,见下)。
- `restart: unless-stopped`,compose 内带 healthcheck。
- 服务绑定 **`127.0.0.1` + `10.126.126.2`(宿主机局域网 IP)**,局域网内可访问。
- 共享 PostgreSQL:容器名 `postgres`(`postgres:16-alpine`),监听 `5432`(两个地址),数据在 `/data/services/postgres`。超级用户 `postgres`,凭据在 `/srv/compose/postgres/.env`。
- 原生(非 Docker)服务用 systemd unit,工作目录 `/srv/services/<服务>/`,以 `oicey` 运行。
- `/srv/compose` 归 root;项目子目录归 `oicey`(创建需一次性 sudo)。
- sudo 需密码;npm registry / GitHub releases 直连不稳定(下载 CLI 二进制需经本机代理中转)。

## 本次部署内容

- **数据库**:共享 postgres 里新建角色 `serenique` + 数据库 `serenique`(OWNER serenique)。密码由 `openssl rand -hex 24` 生成,仅存于 `/srv/compose/serenique/.env`(0600)。TCP 密码认证已验证(`serenique@serenique` @ `10.126.126.2:5432`)。
- **表结构**:服务器无 bun、npm registry 不可达,无法跑 `drizzle-kit migrate`。改用**直接执行 drizzle 迁移 SQL**,并精确复刻 drizzle-kit 的迁移记录:
  - 按 `drizzle/meta/_journal.json` 顺序执行各 `<tag>.sql`(按 `--> statement-breakpoint` 切分)。
  - 建 `drizzle.__drizzle_migrations (id serial PK, hash text, created_at bigint)`,每迁移记 `(sha256(整文件).hex, journal.when)`。
  - 8 条迁移全部应用,7 张表:diaries / moments / blobs / blob_attachments / task_groups / tasks / events。将来 dev 侧 `db:migrate` 会因 hash 匹配而正确跳过。
  - 生成脚本 `~/serenique-deploy/db-create.sh` + `init.sql` 可复用(init.sql 由本地 `gen-init.js` 生成)。
- **Compose 项目** `/srv/compose/serenique/`:
  - `api`: 镜像 `zeroicey/serenique-api:latest`,host `3000`(127.0.0.1 + 10.126.126.2)→ 容器 3000。
  - `mcp`: 镜像 `zeroicey/serenique-mcp:latest`,host `3002`(127.0.0.1 + 10.126.126.2)→ 容器 3001。**host 3001 已被 vocechat 占用**,故用 3002。
  - blob 数据用**命名卷 `serenique_serenique-blob-data`**(全新卷继承镜像内 UID 10001 属主,免 sudo chown;因此未用 `/data/services` bind mount)。
  - `DATABASE_URL` 的 host 用 `10.126.126.2`(宿主机 LAN IP),entrypoint 的 `localhost→host.docker.internal` 重写不触发,免 `extra_hosts`。
  - 两容器均以 **UID 10001(serenique)非 root** 运行,HEALTHCHECK 打 `/health`。
- **CLI**:从 GitHub Release `v0.1.0` 下载 `serenique-linux-amd64`(sha256 校验通过),装到 `~/.local/bin/serenique`(交互 shell PATH 已含该目录,`.zshrc` 179 行)。`serenique config set baseurl http://10.126.126.2:3000`。token 未设(API 暂无鉴权)。

## 验证结果

- 两容器 `Up (healthy)`,`/health` api 200 / mcp 200(transport streamable-http)。
- 运行用户 `uid=10001(serenique)`;blob 目录可写。
- 端到端:curl 建日记 201、`serenique diary list` 读到数据、`serenique moment create --text ...` 成功。
- CLI `--version` = `v0.1.0 (commit 66483c6)`。

## 对下一次会话的提示(pitfalls)

- **更新镜像**:`cd /srv/compose/serenique && docker compose pull && docker compose up -d`。打新版本 tag 后重拉即可,`.env` 无需改。
- **升级 schema**:不能靠容器内 `db:migrate`(镜像 `--omit=dev` 无 drizzle-kit,且服务器 npm 不可达)。沿用本次做法:本地 `gen-init.js` 生成新迁移段的 SQL,用 `docker exec -i postgres psql -U serenique -d serenique < init.sql` 应用,并在 `drizzle.__drizzle_migrations` 按 journal 记录 hash。
- **凭据位置**:DB 密码与 `BLOB_SIGNING_SECRET` 只在 `/srv/compose/serenique/.env`(0600)。**不要写进 git / worklog / 输出日志**。
- **端口**:mcp 对外是 **3002**(3001 被 vocechat 占用);API 3000。局域网地址 `10.126.126.2`。
- **API 暂无鉴权**,局域网内任何设备可读写;上鉴权前如需收紧,把 compose 端口改绑 `127.0.0.1` 即可。
- **GitHub releases 下载在本机可通过代理**(本机 `http_proxy=http://127.0.0.1:7897`),在服务器直连会挂——CLI 二进制这类产物走「本机下载(scp)→服务器」。
- 部署暂存目录 `~/serenique-deploy/` 保留了脚本与产物(不含 secrets),可复用或删除。
