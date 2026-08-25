# hpcore 生产服务器部署

**适用范围**：hpcore（Azure，Arch Linux，用户 `oicey`）。入口：`ssh -J hcyj hpcore`（跳板走 tailscale 节点 hcyj；旧跳板 hpazure 已弃用）。Compose 项目在 `/srv/compose/serenique/`。生产跑 Docker Hub `latest` / `:main` 镜像。

## 前置条件

- 镜像已由 GitHub Actions 构建并推送（main push → `:main`；tag → `latest`）
- 生产 .env 在 `/srv/compose/serenique/.env`（0600），**改动前先 `cp .env .env.bak.<时间戳>`**
- secrets（DB 密码、`BLOB_SIGNING_SECRET`、`SESSION_SECRET`、`SETUP_TOKEN`）只在服务器 .env，**绝不写进 git / worklog / 日志**（`AUTH_TOKEN` 已随 v0.5.0 退役，见下）

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

1. `docker compose up -d` 输出「Container Running」而非「Recreated」= 容器没换镜像，必须 `--force-recreate`。
2. 业务侧验证：真实请求验证行为（如 PUT 超长文本应过校验返回 404 而非 500）。

## 坑：大镜像 pull 中断 / 并发进程竞争（2026-08-13 实测）

- 症状：`docker pull <digest>` 下载慢（200MB+ 多架构），SSH 命令超时中断后，遗留的 pull 进程与重发的 pull **并发竞争**，日志长时间停在 `Pulling fs layer`。
- 解法：`nohup bash -c "docker pull ...@sha256:<digest> && docker tag ... <img>:latest" > /tmp/pull.log 2>&1 &` 后台跑，用 `pgrep -af "docker pull"` 检查**只保留一个** pull 进程（杀掉旧进程），轮询 `/tmp/pull.log` 出现 `TAGGED` 且 `docker images <img>:latest --digests` digest 匹配即完成。
- 服务器上不要嵌套 ssh（`ssh -J` 里再 ssh 本机路径会 `stdio forwarding failed`），循环检查放本地单条 ssh。

## 平台注意（amd64）

- 生产是 **linux/amd64**。本机是 arm64 Mac，`docker build` 默认产出 arm64 镜像，直接 scp/load 会 `Restarting (255)` 崩溃循环。
- 正确姿势：走 GitHub Actions 构建（多架构），服务器 `docker pull zeroicey/serenique-api:main` 后 tag 成 `latest`。
- 手动构建必须 `docker build --platform linux/amd64`。

## Passkey 环境变量（v0.5.0 起）

生产 .env 的认证相关键（**首次配置后不可随意改**，除 SETUP_TOKEN）：

| 键 | 生成方式 | 语义 / 坑 |
| ---- | ---------- | ----------- |
| `SESSION_SECRET` | `openssl rand -hex 32` | cookie 签名密钥。**改了 = 所有会话立即失效**（旧 cookie 验签失败），密钥轮换即全员下线 |
| `SETUP_TOKEN` | `openssl rand -hex 24` | 首个凭证门禁（**passkey_credentials 计数=0** 时 `/setup` 创建凭证必须携带，常量时间比对）。**首个凭证创建完成后可从 .env 移除**，之后加设备走登录态「添加设备」 |
| `WEBAUTHN_RP_ID` | `serenique.0icey.icu`（固定） | **RP ID = 前端域名（serenique.0icey.icu），不是 API 域名**。⚠️ 换前端域名 = 全部 passkey 永久失效（iCloud/Google 按 RP ID 存凭证） |
| `WEBAUTHN_RP_NAME` | `Serenique` | 仅展示用 |
| `WEBAUTHN_ORIGINS` | `https://serenique.0icey.icu` | ceremony origin 白名单（逗号分隔）。移动端 phase 需扩展 Android `android:apk-key-hash:<指纹>` |

- 生产 fail-closed：缺 `SESSION_SECRET` 或 `WEBAUTHN_RP_ID` → 容器拒绝启动（app.ts）；**认证启用且 `users` 表为空 → 拒绝启动**，报错提示先跑引导脚本（见下）。
- `AUTH_TOKEN` 已退役（v0.5.0 迁移时从 .env 删除）；旧客户端 401。
- 数据库迁移 `0014_rapid_stone_men`（users / passkey_credentials / api_tokens 三表）已于 2026-08-09 应用到生产（drizzle 记录 id=15，hash 450a3cdd…）。
- 数据库迁移 `0015_add_moment_pinyin`（moments 加 pinyin / pinyin_initial 两列，全局搜索用）已于 2026-08-13 应用到生产（drizzle 记录 id=16，hash 0bcc286c…）；回填已执行（`docker exec -w /app/services/api serenique-api bun scripts/backfill-moment-pinyin.ts`，107 条全部更新，幂等）。

## 全新安装（引导首个用户 + 首个凭证，v0.5.1 起）

公开「首次注册」已移除（需求决策⑨）：**users 由引导脚本创建，首个凭证由隐藏 `/setup` 页创建**，登录页只留通行密钥登录。

```sh
# 1. 起好 DB + 迁移（见「升级 schema」）后，创建用户行（幂等，可重复跑）
docker compose run --rm api bun scripts/bootstrap-user.ts \
  --name "zeroicey" --email "me@example.com" --birthday "1990-01-01"
#    ⚠️ docker compose run 覆盖 CMD → entrypoint 的 localhost→host.docker.internal
#    重写不执行：容器内 DATABASE_URL 用 compose 网络服务名（postgres）即可直达。
#    参数可用 env FIRST_USER_NAME/FIRST_USER_EMAIL/FIRST_USER_BIRTHDAY 替代。

# 2. 浏览器打开（仅此一次，需 SETUP_TOKEN 在 .env 中）
#    https://serenique.0icey.icu/setup?setupToken=<SETUP_TOKEN>
#    → 「创建通行密钥」→ 自动登录。（该页无任何导航入口，凭证已存在时访问跳登录页）

# 3. 验证后移除 SETUP_TOKEN 并重建容器
#    vi .env（删 SETUP_TOKEN 行）→ docker compose up -d --no-deps api
```

- 用户可见面只有「通行密钥登录」；users 空表时服务起不来（fail-closed），前端只会看到「服务暂时不可用」。
- 引导脚本在镜像内（services/api/scripts/ 已随镜像拷贝，WORKDIR /app/services/api），服务器无需 bun/npm。

## AI 助手（宁序）配置（2026-08-21 起，OpenCode Go 订阅到期 → OpenAI 兼容端点）

- `.env` 新增：
  - `AI_API_KEY=<OpenAI 兼容端点 key>`（必配；缺省模型 `newapi/ox-alpha`）
  - `AI_BASE_URL=<OpenAI 兼容端点>`（可选，缺省 `http://hpcore.hpnet.internal:3005/v1`——hpcore NewAPI 网关）
  - `AI_MODEL=<provider>/<modelId>`（可选，缺省 `newapi/ox-alpha`；换模型/端点只改 .env，无需改代码）
  - `AI_CONTEXT_WINDOW`/`AI_MAX_TOKENS`（可选，单模型元数据兜底，默认 1048576/131072）
- 容器无用户级 `~/.pi/agent/models.json` → api 启动时从以上 env 生成最小配置到 `/data/ai/models.json`
  （模型目录只含 AI_MODEL 这一个 id）；开发机则直接复用 `~/.pi/agent/models.json` 的 newapi 提供者
  ——但显式配了 `AI_API_KEY`/`AI_BASE_URL` 时 env 驱动配置优先（2026-08-25 起）。
- ⚠️ `/data/ai` 必须挂独立 named volume 且属主为 10001（2026-08-25 实测）：容器内 `/data` 本身是 root 属主，
  无卷时 `mkdir /data/ai` EACCES → isAiEnabled 静默 false（无报错日志）。compose 已加 `serenique-ai-config:/data/ai`；
  新建后若属主为 root 需一次性修复：`docker exec -u root serenique-api chown 10001:10001 /data/ai`。
- ⚠️ 容器内访问 hpcore 网关：域名 `hpcore.hpnet.internal` 走宿主 tailscale MagicDNS，容器内不可解析 →
  compose extra_hosts 已钉 `hpcore.hpnet.internal:100.64.0.1`；且必须加进 NO_PROXY（否则流量绕 mihomo 返回 502）。
- 冒烟命令（容器内项目目录，`@/` 别名才能解析）：

  ```sh
  docker exec -w /app/services/api serenique-api bun tmp-smoke.ts
  # tmp-smoke.ts: import { aiService } from "@/modules/ai/ai.service";
  #   → isAiEnabled() + openRecentOrCreate() + session.prompt("...") 验证模型/对话/落盘
  ```

## 坑：fake-ip DNS 劫持 → 容器必须走 mihomo 代理（2026-08-09 实测）

- **症状**：容器/宿主 curl 任意公网域名（google/baidu/deepseek/opencode）全部 TCP 超时，但 `ping 8.8.8.8` 通、`docker pull` 能成功（镜像加速器例外）。
- **根因**：家庭网关（192.168.5.1）做 fake-ip DNS 劫持（`dig @223.5.5.5` 正常，但系统 DNS 返回 `198.18.x.x` 保留网段——Clash/mihomo fake-ip 特征），本机流量没挂 TUN 时 198.18.x.x 不可路由 → 超时。
- **解法**：走本机 mihomo HTTP 代理（`/usr/bin/mihomo -d /etc/mihomo`，监听 `*:7890`）：
  - 验证：`curl -x http://127.0.0.1:7890 https://opencode.ai/zen/go/v1/models` → 200。
  - compose.yml 的 api 服务已配 `HTTP_PROXY/HTTPS_PROXY=http://host.docker.internal:7890` + `extra_hosts: host.docker.internal:host-gateway` + `NO_PROXY=localhost,127.0.0.1,postgres,::1`。**改 compose 后必须 `docker compose up -d --force-recreate api`**。
  - Bun 原生 fetch 支持 `HTTPS_PROXY` env（undici/pi-ai 走全局 fetch，代理生效；已容器内实测 200）。
- **影响面**：凡容器内需要出公网的功能（AI 模型调用、未来任何外呼）都必须走该代理；仅本机 ping/内网不受影响。

## 回滚

- 服务器 `docker compose pull` 旧 `latest`，或拉 CI 构建的 `:main` 后 tag 成 `latest`。
- 改生产 .env 后 `docker compose up -d --no-deps api` 重建。

## 升级 schema（手动迁移）

服务器无 bun、npm registry 不可达，不能跑 `drizzle-kit migrate`：

1. 本地按 `drizzle/meta/_journal.json` 顺序取新增的 `<tag>.sql`（按 `--> statement-breakpoint` 切分）。
2. 经 stdin 直灌：`docker exec -i postgres psql -U serenique -d serenique < <迁移.sql>`（heredoc/stdin 传 SQL 最稳，**SQL 字面量用单引号**——多层 ssh 嵌套时双引号会被 PG 当标识符）。
3. 记迁移：`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256(整文件)>', <journal.when>);`（id 自增）。

## 公网链路（api.hcyj.xyz/serenique，2026-08-25 起）

> 旧链路 `api.zeroicey.me (hpazure) → frps/frpc → hpcore` 已随 hpazure 弃用而退役；
> EasyTier 也已弃用，跨机互联统一走 Tailscale。

- 路径：`api.hcyj.xyz/serenique/* (hcyj docker Caddy) → Tailscale 直连 hpcore:3000 (100.64.0.1)`，
  `handle_path` 剥掉 `/serenique` 前缀后反代；无 frp 环节。
- Caddyfile：hcyj `/root/hcyj/caddy/Caddyfile`（docker 挂载），改前备份 `Caddyfile.bak.*`，
  `docker exec caddy caddy validate` 后 `caddy reload`。证书由 Caddy 自动签（api.hcyj.xyz）。
- 上游必须 `keepalive off` + 超时参数——否则连接被 Bun API 重置后重试造成偶发慢请求（沿用旧坑结论）。
- Web 前端：`serenique.0icey.icu`（Cloudflare，源站 Pages/静态托管），API 地址以构建时 `VITE_API_BASE_URL`
  为准；改入口时需重新构建 web 并核对 CORS（生产 `.env` 的 `CORS_ORIGIN=https://serenique.0icey.icu` 不变）。
- hpcore 本地验证：`curl http://127.0.0.1:3000/health`；公网验证：
  `curl https://api.hcyj.xyz/serenique/health`。
- 服务器端口：API 对外 3000；MCP 对外 3002（3001 被 vocechat 占用）。
