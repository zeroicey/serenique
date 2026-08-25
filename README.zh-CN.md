# Serenique

[English](README.md) | **简体中文**

![CI - Docker Publish](https://github.com/zeroicey/serenique/actions/workflows/docker-publish.yml/badge.svg)
![CI - CLI Release](https://github.com/zeroicey/serenique/actions/workflows/release-cli.yml/badge.svg)
![Docker Image Version](https://img.shields.io/docker/v/zeroicey/serenique-api?sort=semver&label=docker)
![Docker Pulls](https://img.shields.io/docker/pulls/zeroicey/serenique-api)
![License](https://img.shields.io/github/license/zeroicey/serenique)

自托管、隐私优先的个人日记与笔记服务。随手记录闪念、管理任务与日历事件、存储文件 —— 全部以 Passkey（WebAuthn）认证保护，并内置一个通过对话帮你管理一天的 AI 助手「宁序」。

面向单人使用设计，可部署在任何地方（Docker、VPS 或自己的硬件），拥有四个使用入口：React Web 应用、Go CLI（既给人用也给 AI Agent 用）、iOS/Android Flutter 应用，以及 REST API 本身。

## 功能特性

- **闪念笔记（Moments）**——短文本笔记（≤10000 字），支持嵌套自评论（≤2000 字）、标签、文件附件与位置信息
- **任务（Tasks）**——自定义任务组 + 简单任务，状态流转（`todo` / `done` / `abandon`）；`completedAt` 与状态自动同步
- **日历事件（Events）**——标题、起止时间、全天、地点、备注；时间窗口查询直接返回裸数组，便于消费
- **文件存储（blob）**——任意 MIME 类型，SHA-256 内容去重，图片尺寸提取（JPEG/PNG/GIF/WebP），单 `Range` 断点下载，HMAC 签名临时访问链接
- **AI 助手「宁序」**——WebSocket 聊天，Agent 通过 `defineTool` 直接调用 API service 层（任务/事件/闪念 CRUD）；流式 Markdown、可见思考过程、工具调用卡片、会话切换 —— 无确认弹窗，说了就做
- **安全**——Passkey（WebAuthn）登录、GitHub PAT 模式的 API Token（供 CLI/脚本）、无状态 HMAC 签名会话 Cookie、凭证计数器审计、生产环境 fail-closed 启动
- **审计日志**——记录每一次认证与令牌操作，带保留期清扫与未读追踪
- **多端一体**——Web（React）、CLI（Go）、移动端（Flutter）、REST API 共享同一套服务层

## 仓库结构

```
serenique/
├── services/
│   ├── api/            # REST API —— Bun + Hono + Drizzle + PostgreSQL（契约的事实源）
│   └── mcp/            # 旧版 MCP 服务 —— 已冻结，不再维护
├── apps/
│   ├── cli/            # Go CLI（cobra，gh 风格），供人与 AI Agent 使用
│   ├── web/            # React Web 客户端
│   └── mobile/         # Flutter 应用（iOS/Android）
├── scripts/            # docker-entrypoint.sh（容器内数据库主机名改写）
├── .github/workflows/  # CI/CD —— Docker 镜像发布 + CLI 多平台发布
└── .env.example        # 全部服务的环境变量说明文档
```

## 技术栈

| 层 | 技术 |
|----|------|
| API | Bun、Hono、Drizzle ORM、PostgreSQL、Zod、Pino、`@simplewebauthn/server`、PI Agent SDK（`@earendil-works/pi-coding-agent`） |
| Web | React 19、Vite、shadcn/ui、TanStack Query、zustand、react-router、streamdown |
| CLI | Go 1.26+、cobra、yaml.v3 |
| 移动端 | Flutter（Material 3）、dio、Riverpod 3、go_router、flutter_secure_storage |
| 基础设施 | Docker（多架构 amd64/arm64）、GitHub Actions、Docker Hub |

## 本地开发

前置依赖：[Bun](https://bun.sh)、[Go](https://go.dev/dl/) 1.26+（仅 CLI）、[PostgreSQL](https://www.postgresql.org/)（可用 Docker 起本地实例）、[Flutter](https://flutter.dev)（仅移动端）。

### 1. 启动 API

```sh
cd services/api
bun install
cp ../../.env.example .env   # 修改 DATABASE_URL 等配置
bun run db:push              # 建表（或 bun run db:migrate）
bun run dev                  # http://localhost:3000
```

> 本地开发时若未配置 `WEBAUTHN_RP_ID`，认证会整体跳过，零摩擦起步；想要真实的 Passkey 流程时再设置它。

### 2. 启动 Web 客户端

```sh
cd apps/web
bun install
bun run dev                  # http://localhost:5173（/api 代理到 :3000）
```

### 3. 试用 CLI

```sh
cd apps/cli
make build
./bin/serenique init         # 指向你的 API 并配置 API Token
./bin/serenique moment create -m "你好，Serenique"
```

## Docker 自托管部署

```sh
docker run -d --name serenique -p 3000:3000 \
  -e DATABASE_URL=postgresql://serenique:serenique@host:5432/serenique \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -e BLOB_SIGNING_SECRET=<32 位以上字符> \
  -e SESSION_SECRET=<32 位以上字符> \
  -e SETUP_TOKEN=<32 位以上字符> \
  -e WEBAUTHN_RP_ID=your-web-domain \
  -e WEBAUTHN_ORIGINS=https://your-web-domain \
  -e CORS_ORIGIN=https://your-web-domain \
  -e AI_API_KEY=<key> \
  -e AI_BASE_URL=http://hpcore.hpnet.internal:3005/v1 \
  -v serenique-blobs:/data/blobs \
  -v serenique-sessions:/data/sessions \
  zeroicey/serenique-api:latest
```

然后创建用户行并注册第一把 Passkey：

```sh
docker exec -it serenique bun scripts/bootstrap-user.ts   # 创建 users 行（幂等）
# 打开 https://your-web-domain/setup?setupToken=<SETUP_TOKEN> 注册第一把 Passkey
# 注册完成后即可从环境变量中移除 SETUP_TOKEN
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（**必需**） |
| `BLOB_ROOT` | 文件存储根目录 —— 容器内固定为 `/data/blobs` |
| `BLOB_MAX_SIZE` | 单次上传大小上限（默认 100 MB） |
| `BLOB_SIGNING_SECRET` | 签名访问链接的 HMAC 密钥（≥32 字符） |
| `SESSION_SECRET` | Cookie 签名密钥（≥32 字符）。**生产必需**（fail-closed）；更换即所有会话失效 |
| `SETUP_TOKEN` | 引导注册令牌（≥32 字符）；首把 Passkey 注册完成后可移除 |
| `WEBAUTHN_RP_ID` | 前端域名（不是 API 域名）。更换会使已注册的 Passkey 全部失效；未配置 = 跳过认证（仅开发） |
| `WEBAUTHN_ORIGINS` | WebAuthn 注册/登录 origin 白名单（逗号分隔） |
| `CORS_ORIGIN` | Web 前端 origin，带凭证的跨域请求必需 |
| `AI_API_KEY` | AI 助手凭据（NewAPI 网关） |
| `AI_BASE_URL` | OpenAI 兼容端点（默认 `http://hpcore.hpnet.internal:3005/v1`） |
| `AI_MODEL` | 模型覆盖（默认 `newapi/ox-alpha`） |
| `AI_SESSION_DIR` | AI 会话目录（生产默认 `/data/sessions`） |
| `FIRST_USER_NAME` / `FIRST_USER_EMAIL` / `FIRST_USER_BIRTHDAY` | 引导脚本的默认用户信息 |
| `AUDIT_RETENTION_DAYS` / `AUDIT_MAX_ROWS` | 审计日志保留策略（默认 90 天 / 5000 条） |
| `SESSION_TTL` | 会话 Cookie 有效期（秒，默认 30 天） |
| `PORT` | API 端口（默认 3000） |

注意事项：

- 镜像以**非 root（UID 10001）**运行。新建的命名卷会自动继承属主；已存在的卷需一次性执行 `docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`。
- 入口脚本会把 `localhost` 数据库主机名改写为 `host.docker.internal`，方便容器访问宿主机上的 Postgres。
- 密钥从不进入镜像 —— 全部通过 `docker run -e` 传入。

## CLI 概览

`serenique` 是一款 `gh` 风格的命令行客户端，覆盖 API 全部能力 —— 特别适合脚本与 AI Agent（`--json` 输出、非零退出码、令牌掩码、安全下载）。命令：`init`、`config`、`auth`、`token`、`moment`、`task`、`blob`、`logs`、`tag`。完整参考：[apps/cli/README.md](apps/cli/README.md)。

## 文档

- [CLI 完整参考](apps/cli/README.md) —— 全部命令与示例、配置优先级、AI Agent 使用模式
- [移动端说明](apps/mobile/README.md) —— Flutter 应用配置、模块、真机安装指引
- [环境变量参考](.env.example) —— API、Web 与 AI 助手的全部环境变量

## License

[MIT](LICENSE) © 2026 zeroicey
