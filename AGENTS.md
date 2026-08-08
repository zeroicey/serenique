# AGENTS.md

Serenique 是个人日记与笔记服务（personal journaling and note-taking）。本文件为 opencode 在此仓库工作时提供指引。

## Project overview

Monorepo，包含两类包：

- `services/` — 服务端进程：
  - `services/api` — REST API（Bun + Hono + Drizzle + PostgreSQL）
  - `services/mcp` — 把 API 的 service 层暴露给 AI Agent 的 MCP 服务器
- `apps/` — 客户端应用：
  - `apps/cli` — Go CLI 客户端（cobra），仿 GitHub `gh`，供人与 AI Agent 使用

**API 栈：** Bun runtime、Hono web 框架、PostgreSQL（Drizzle ORM）、Zod 校验、Pino 日志、TypeScript strict。
**CLI 栈：** Go（1.26+）、cobra、yaml.v3。

改子系统前先读项目记忆 `.ai/`（见下）。

## Project memory (`.ai/`)

仓库根 `.ai/` 是项目记忆，视为正式文档。包含：

- `worklog/` — 按日期的工作日志：每天做了什么、评估了什么、修了什么，以及显式的坑（"对下一次会话的提示"）
- `architecture/` — 架构设计文档。后写文档取代先写文档（如 `2026-08-05-cli-tool-architecture-updates.md` 明确标注为定稿 CLI 架构）
- `decisions/` — 决策记录，含 **Why** / **How to apply** 理由，包括被否决/推迟的选项
- `requirements/` — 需求文档

动工前读与本次改动相关的最新文档。CLI 的评估历史与硬化契约在 08-05 的 worklog/architecture/decisions 中，已浓缩进下方 CLI 章节。

## AI 智能体团队（多 Agent 协作）

Serenique 采用「队长 + 领域专家 Agent」协作模式：**主会话（opencode build agent）就是队长**，负责拆解需求、派活、验收与集成；领域专家是 `.opencode/agents/*.md` 子代理（`mode: subagent`），按需派发、可并行。

| Agent | 文件 | 领域 |
|-------|------|------|
| API Agent | `.opencode/agents/api-agent.md` | `services/api`：REST、数据模型、服务层、测试、`exports.ts` |
| MCP Agent | `.opencode/agents/mcp-agent.md` | `services/mcp`：AI 工具暴露、streamable-http |
| CLI Agent | `.opencode/agents/cli-agent.md` | `apps/cli`：Go 命令行客户端 |
| Web Agent | `.opencode/agents/web-agent.md` | `apps/web`：React 浏览器端 |
| Deploy Agent | `.opencode/agents/deploy-agent.md` | Docker、GitHub Actions、发布、服务器 |
| Flutter Agent | `.opencode/agents/flutter-agent.md` | 移动端 Flutter（iOS/Android，规划中） |

派发规则：一个需求往往同时涉及多个子系统（如「新增 drive 模块」会动 API + MCP + CLI + Web）。队长先拆解出受影响子系统，再**并行派发**相关 Agent（同一消息内多个 Task 工具调用 = 并行），各自在领域内开发；队长负责跨端契约对齐（以 `services/api` 源码为准：字段名、响应结构、`exports.ts` 导出面）与最终验收。手动调用可在对话中 `@agent-name` 触发。

所有 Agent 权限与队长一致（不写 `permission` 字段 = 继承全部工具），技术栈已限定为各端当前技术栈，且强制使用项目记忆（动工前读 `.ai/`、完成后写 worklog）。团队章程见 `.opencode/agents/README.md`，决策记录见 `.ai/decisions/2026-08-06-ai-agent-team.md`。

## Commands

仓库根常用命令：

```sh
bun install          # 安装 workspace 依赖
bun run typecheck    # 类型检查 api + mcp
bun test             # 只跑 services/mcp 测试（bun run --cwd services/mcp test）
docker compose up -d --build api mcp
```

根目录 `bun test` 只覆盖 MCP 服务。API 测试要在 `services/api/` 里跑。

API 专属命令（在 `services/api/` 下执行）：

```sh
bun install          # 安装依赖
bun run dev          # 热重载开发服务器（端口 3000）
bun run start        # 同 dev
bun test             # API 单元/集成测试（bun test）
bun run typecheck    # 单独类型检查 api 包
bun run db:generate  # 从 schema 生成 Drizzle 迁移（需 TTY）
bun run db:migrate   # 应用待执行迁移
bun run db:push      # 直接把 schema 推到 DB（绕过迁移，CI 可用）
```

CLI 命令（在 `apps/cli/` 下执行）：

```sh
make build           # 构建 bin/serenique（版本经 ldflags 注入）
make install         # 复制二进制到 /usr/local/bin
make build-all       # 交叉编译 5 平台
make test            # go test ./...（跑 cmd + internal 包）
go build ./...       # 编译检查
go vet ./...         # 静态检查
go test -count=1 ./...  # 全量测试（-count=1 绕过缓存）
```

网络注意：拉 Go 模块需中国镜像 `GOPROXY=https://goproxy.cn,direct`（本网络 `proxy.golang.org` 不可达）。

Docker 构建网络注意：构建容器无法直连 `registry.npmjs.org`——`docker compose build` 会在 `bun install` 时对每个 tarball 报 `ConnectionRefused`。重建时注入 host 代理 build args（Docker 预定义代理参数，无需改 Dockerfile）：

```sh
docker compose build --build-arg http_proxy=http://host.docker.internal:7897 \
  --build-arg https_proxy=http://host.docker.internal:7897 \
  --build-arg no_proxy=localhost,127.0.0.1 api mcp
```

`host.docker.internal:7897` 是宿主机的本地 HTTP 代理（见本机 `http_proxy` env）；端口变了就改。`docker compose up -d`（不带 `--build`）不需要代理参数——只有重建需要。Dockerfile 保持 registry 无关，任何网络都能构建。

Docker Compose 运行时环境从项目根 `.env` 加载。不使用服务局部 `.env`。secret 不进镜像；根 `.dockerignore` 排除 `.env`。

## Architecture

### Monorepo 布局

```
apps/cli/             Go CLI 客户端（cobra）— 见下方 "CLI 模块"
services/api/         REST API — Bun + Hono + Drizzle + PostgreSQL
services/mcp/         MCP 服务器，经 streamable-http 暴露 API service 层
scripts/              docker-entrypoint.sh（把 localhost DB host 重写为 host.docker.internal）
.ai/                  项目记忆：worklog/ architecture/ decisions/ requirements/
```

### services/api

```
services/api/src/
├── index.ts          — 入口：校验 env、初始化 blob root、创建 app
├── app.ts            — App 工厂：装配中间件、路由、错误处理、404
├── env.ts            — Zod 校验的 env（DATABASE_URL, BLOB_ROOT, BLOB_MAX_SIZE, BLOB_SIGNING_SECRET, AUTH_TOKEN, SESSION_TTL, PORT, NODE_ENV）
├── exports.ts        — @serenique/api 的公开 workspace 导出（仅 service 层，无 Hono）
├── db/
│   ├── connection.ts — 单一 Drizzle client + Postgres 连接池（所有模块共用）
│   └── schema.ts     — 中央 schema 注册表，Drizzle Kit 读它生成迁移
├── shared/
│   ├── errors.ts     — AppError 类（codes: NOT_FOUND, VALIDATION, INTERNAL）
│   ├── logger.ts     — Pino 日志（dev 用 pino-pretty，prod 结构化 JSON）
│   ├── response.ts   — 统一响应 builder：Res.ok(msg, data).build(c)
│   └── storage.ts    — 本地磁盘 I/O、SHA-256 校验和、图片尺寸提取、blob root 初始化
├── middleware/
│   ├── cors.ts       — CORS：dev 宽松，可用 CORS_ORIGIN 配置
│   ├── index.ts      — 中间件 barrel 导出
│   └── logger.ts     — 请求日志（method, path, status, duration）
└── modules/
    ├── blob/         — 通用二进制存储层（任意 MIME，SHA-256 去重）
    ├── diary/        — 日记（每天一条，按日期；字段：content, diaryDate）
    ├── moment/       — 闪念笔记（≤10000 字符；字段：text；经 blob ref 挂媒体附件；`comment.*` 嵌套自评论，≤2000 字符）
    ├── task/         — 任务组（自定义）+ 简单任务（字段：groupId/title/status；completedAt 随 status 同步）
    └── event/        — 日历事件（字段：title/startAt/endAt/isAllDay/location/note；时间窗列表，裸数组）
```

### 模块结构

每个模块固定文件集（核心骨架）：

| 文件 | 职责 |
|------|------|
| `*.schema.ts` | Drizzle 表定义 |
| `*.types.ts` | Zod 校验 schema + 输入/输出 TS 类型 |
| `*.service.ts` | 导出**单例** `xxxService`；在 `db` / `@/shared/*` / `@/env` 之上编排；抛 `AppError` |
| `*.handler.ts` | Zod 解析请求 → 调 service → 构建 `Res` 响应；经 `shared/handler.ts` 的 `handleError` 统一错误处理 |
| `*.router.ts` | Hono 路由，挂载于 `/api` 下 |
| `index.ts` | 路由的 barrel re-export |

模块有纯业务规则或 row→entry 转换时，放进独立文件以保持 service 精简：

| 文件 | 职责 |
|------|------|
| `*.domain.ts` | 纯业务规则/计算/校验 — **不 import DB/IO**，毫秒级单测 |
| `*.mappers.ts` | row→entry 转换，纯函数 |

Service 不使用 repository 接口或工厂/DI——DB 是 service 的实现细节，可测逻辑提取为 `*.domain.ts` 纯函数。

测试双层约定（见 `.ai/decisions/2026-08-05-service-layer-architecture.md`）：

| 文件 | 职责 |
|------|------|
| `*.service.test.ts` | 单元测试：domain 纯函数 + Zod schema + mappers，不碰 DB |
| `*.service.integration.test.ts` | 真 PostgreSQL（blob 用真磁盘），`RUN_DB_TESTS=1` 门控，否则跳过 |

共享测试 helper 在 `src/test/helpers.ts`。运行：`cd services/api && bun test`（单元）或 `bun run test:integration:full`（DB 集成）。

每个模块是自包含的 Hono 实例，在 `app.ts` 经 `app.route("/api", moduleRouter)` 装配。

### 关键模式

- **App 工厂：** `createApp(env)` 创建 app——env 在 `index.ts` import 时解析，非法即快速崩溃
- **启动初始化：** `index.ts` 在创建 app 前顶层 await 调用 `initBlobRoot(env.BLOB_ROOT)`，校验并创建 blob 存储目录
- **统一响应形状：** 所有 API 响应用 `{ success, code, message, data?, error? }`。用 `shared/response.ts` 的 `Res` builder——handler 里绝不直接 `c.json()`
- **错误处理：** service 抛 `AppError`，handler 捕获转响应；`app.ts` 全局 `onError` 兜底任何未处理错误返回 500
- **路径别名：** `@/*` → `./src/*`（tsconfig.json 配置）
- **数据库：** 全仓只用 `db/connection.ts` 的单一 `db` 导出，禁止第二个连接池。中央 `db/schema.ts` re-export 所有表定义——Drizzle Kit 读这个文件，所以每个新表必须在此导出
- **Service 里的 env：** 需要环境变量的 service（如 `blob.service.ts` 需要 `BLOB_ROOT`/`BLOB_MAX_SIZE`）直接从 `@/env` import——service 与环境配置紧耦合时允许
- **Workspace 导出：** `src/exports.ts` 是 `@serenique/api` 包入口——re-export service 层、Zod schema、共享工具（无 handler/router/middleware）。MCP 经此消费 API（`import { ... } from "@serenique/api"`）。导出面保持小且类型化；外部消费者共享同一 DB 连接

### Blob 模块（底层二进制存储）

blob 模块定位为其他模块（diary、moment，以及未来 drive/netdisk 等）的**共享存储层**。无业务层文件类型限制——任意 MIME 均可。

- **磁盘布局：** `{BLOB_ROOT}/objects/{mime-main-type}/{YYYY}/{MM}/{uuid}.{ext}`。读取/删除也兼容回退旧直接根目录布局
  - 示例：`objects/image/2026/08/a1b2c3d4.jpg`、`objects/application/2026/08/b2c3d4e5.pdf`
- **去重：** SHA-256 校验和 + `checksum` 列唯一约束。重复上传同一文件返回既有记录，不写盘
- **元数据：** `jsonb` 列可扩展（EXIF、编码信息、自定义标签）。不校验——由消费模块自定义约定
- **图片尺寸：** 上传时从二进制头提取（JPEG/PNG/GIF/WebP），零依赖
- **附件：** `blob_attachments` 单独存业务级引用（`ownerType`、`ownerId`、`role`、排序、显示名、元数据），与物理 `blobs` 分离。消费模块应挂既有 blob，不复制文件元数据
- **一致性清理：** 写盘后 DB 插入失败则删除刚写的磁盘文件。维护端点可删除无 `blobs.storage_path` 引用的孤儿磁盘文件
- **文件传输：** 下载返回 filesystem-backed `Blob` 体（不整文件进 `Buffer`），支持单 `Range` 请求 `206 Partial Content`
- **签名访问：** `POST /api/blobs/:id/access-link` 在配置 `BLOB_SIGNING_SECRET` 时生成 HMAC 链接（`/api/blobs/:id/file?expires=&signature=`）。未加 auth 中间件前直连文件仍可用
- **文件操作：** blob 删除是物理删除，仅当无附件引用时允许。附件删除只删引用。物理删除先删 DB 记录再尝试删磁盘（磁盘失败只记日志，不致命）

### API 路由

| Method | Path | Module |
|--------|------|--------|
| GET | `/health` | 健康检查 |
| GET | `/` | API 信息 |
| POST | `/api/auth/login` | 认证登录（密钥换 HttpOnly 会话 Cookie） |
| POST | `/api/auth/logout` | 退出登录（清 Cookie） |
| GET | `/api/auth/me` | 登录态查询 |
| GET, POST | `/api/diaries` | 日记列表 / 创建 |
| GET | `/api/diaries/by-date/:date` | 按日期取日记（无则 404；注册在 `:id` 之前） |
| GET, PUT, DELETE | `/api/diaries/:id` | 日记详情 / 更新 / 删除 |
| GET, POST | `/api/moments` | 闪念列表 / 创建（创建可带可选 `attachments[]`） |
| GET, PUT, DELETE | `/api/moments/:id` | 闪念详情 / 更新 / 删除 |
| POST, DELETE | `/api/moments/:id/attachments[/:attachmentId]` | 闪念附件创建 / 删除 |
| GET, POST | `/api/moments/:id/comments` | 闪念评论列表 / 创建（body `{ content }`，≤2000） |
| PUT, DELETE | `/api/moments/:id/comments/:commentId` | 闪念评论更新 / 删除 |
| POST | `/api/blobs/upload` | Blob 上传（multipart，字段：`file`） |
| POST | `/api/blobs/cleanup-orphans` | 删除无 blob 行引用的磁盘文件 |
| GET | `/api/blobs` | Blob 列表（`?mimeType=image/&page=&pageSize=`） |
| GET | `/api/blobs/:id` | Blob 元数据 |
| GET | `/api/blobs/:id/file` | Blob 下载/预览（`?download=1` 强制附件） |
| POST | `/api/blobs/:id/access-link` | 创建临时签名访问链接 |
| DELETE | `/api/blobs/:id` | Blob 删除（DB + 磁盘） |
| POST, GET | `/api/blobs/:id/attachments` | 创建 / 列出 blob 附件引用 |
| DELETE | `/api/blob-attachments/:id` | 只删附件引用 |
| GET, POST | `/api/task-groups` | 任务组列表 / 创建 |
| GET, PUT, DELETE | `/api/task-groups/:id` | 任务组详情 / 重命名 / 删除 |
| GET, POST | `/api/tasks` | 任务列表（`?groupId=&status=`）/ 创建 |
| GET, PUT, DELETE | `/api/tasks/:id` | 任务详情 / 更新（status 同步 `completedAt`）/ 删除 |
| GET, POST | `/api/events` | 事件列表（`?from=&to=` 时间窗，**裸数组**）/ 创建 |
| GET, PUT, DELETE | `/api/events/:id` | 事件详情 / 部分更新 / 删除 |

字段命名坑：diary 用 `content`/`diaryDate`，但 moment 用 `text`——别混淆。CLI 契约（及 MCP）跟随 API 源码：moment body 是 `{ "text": ... }`。event 用 `title`/`startAt`/`endAt`/`isAllDay`/`location`/`note`；其列表是时间窗查询返回**裸数组**（不是 `{ items, total }`）。

用户可见消息用中文。

### 认证（Auth）

单一共享密钥认证：所有端共用根 `.env` 的高熵 `AUTH_TOKEN`（≥32 字符，建议 48+）。**生产缺失则 API 启动即拒绝**（fail closed）；dev 未配置时认证整体跳过（本地零摩擦）。

- **CLI / 移动端 / 脚本：** 请求头 `Authorization: Bearer <AUTH_TOKEN>`
- **Web（浏览器）：** `/login` 表单提交 `{ token }` → 换 **HttpOnly 签名 Cookie**（`serenique_session`，无状态 HMAC 签名，无会话表），请求带 `credentials:"include"`
- **中间件放行列表：** `/health`、`/`、`/api/auth/login`、`/api/auth/logout`、签名 blob 文件链接（`/api/blobs/:id/file?expires=&signature=`）
- **换密钥 = 全端失效：** 改 `.env` 重启后旧会话 Cookie 与旧 Bearer 全部失效，无会话表可清
- 会话 Cookie 默认 30 天（`SESSION_TTL`，秒）。生产跨域（如 pages.dev → api.zeroicey.me）需 `CORS_ORIGIN` 显式设为 Web 域名——带凭证跨域不允许 `*`

### services/mcp

Bun + `@modelcontextprotocol/sdk` 服务器，经 **streamable-http** 在 `/mcp`（端口 3001）把 diary/moment/blob 操作暴露给 AI Agent。经 `@serenique/api` workspace 包直接调 API service 层（同一 DB），不走 HTTP。工具在 `src/tools/*.tools.ts` 定义、`src/server.ts` 注册。

### CLI 模块（`apps/cli`）

Go + cobra CLI（类 `gh`）。依赖方向：`cmd/`（cobra 命令）→ `internal/{config,client,output}`——三个 internal 包互相独立。配置在 `~/.serenique/config.yaml`，优先级 CLI flag > env（`SERENIQUE_BASEURL`/`SERENIQUE_TOKEN`）> file > 默认。`--json`/`-j` 把 `output.Printer` 切到机器可读 JSON。

08-05 评估定稿的硬契约——不得回归：

- **错误必须 exit 非零。** 每个 `RunE` 返回 error；失败绝不 `return nil`。`rootCmd` 用 `SilenceUsage` + `SilenceErrors`，错误只渲染一次
- **stdout 纯净。** 结果（table，或 `--json` 下单个 JSON 文档）→ stdout；进度/确认/错误 → stderr。优先 `output.Printer`；不裸 `fmt.Printf` 打 stdout
- **token 掩码。** 任何 token 输出——包括 `--json`（机器消费模式）——都走 `maskToken()`
- **API 契约以 `services/api` 工作区源码为准**，不是运行中的容器。moment 字段是 `text`；后端字段变更时同步 CLI struct 的 `json:"..."` tag
- **下载路径净化。** 默认文件名必须过 `filepath.Base()`；绝不直接 `os.Create(originalName)`（路径穿越）
- **传输可取消 + 有界。** 根 context 由 `signal.NotifyContext(os.Interrupt, SIGTERM)` 派生；传输 client 设 `ResponseHeaderTimeout`。传输路径禁用 `context.Background()`
- **配置安全。** 文件 `0600`、目录 `0700`、原子写（temp+rename）、symlink 安全 chmod。新配置字段必须贯通 `Resolve`、优先级与 `config set` 白名单
- **确认交互。** 用 `helpers.confirm()`——stderr 提示；非交互 stdin 遇 EOF 视为"未确认"→ 错误 → exit 非零
- **CJK 安全截断。** 用 `truncateRunes()`，绝不按字节切片字符串
- **`List` 是泛型自由函数，不是方法**（Go 禁止非泛型接收者类型上的泛型方法）
- **全量验证**是 `go build ./... && go vet ./... && go test -count=1 ./...`（`make test` 跑 `go test ./...`，含 `cmd/`）

新增模块（如 drive）：`internal/client/drive.go`（类型化方法）→ `cmd/drive.go`（cobra 命令）→ 在 `cmd/root.go` 注册。其他都不用动。

## Release / 发布流程

版本号来自 git tag（`vX.Y.Z`）——CLI 的 `--version` 由 tag 注入（`git describe --tags` / CI 里 `GITHUB_REF_NAME`），所以**打 tag 是发布的前提**。发布全走 GitHub Actions，两步：

```sh
# 1. 提交并推送 main → docker-publish 推 zeroicey/serenique-{api,mcp}:main
git push origin main

# 2. 打版本 tag 并推送 → 同时触发 docker-publish（版本 tag + latest）与 release-cli（GitHub Release）
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

- `.github/workflows/docker-publish.yml` — 多架构（linux/amd64+arm64）构建推送 Docker Hub。tag `v*` → `{version}` / `v{version}` / `latest`；main push → `main`；支持 `workflow_dispatch`。需要 GitHub secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`（Docker Hub access token，**与 `gh` 的 GitHub 登录无关**）
- `.github/workflows/release-cli.yml` — tag `v*` 时云编译 5 平台（对齐 Makefile `build-all`）+ `checksums.txt` + `gh release create --generate-notes`
- Docker Hub 命名空间：`zeroicey`（`zeroicey/serenique-api`、`zeroicey/serenique-mcp`）
- 镜像以**非 root（UID 10001）**运行：全新命名卷自动继承镜像内属主；已存在的卷需一次性 chown 到 10001（`docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`），否则容器写不进 `/data/blobs`
- 关键坑点（bun `--production` 隐式冻结 lockfile、`--filter` 与 `--frozen-lockfile` 不兼容、metadata-action `enable` 表达式写法）详见 `.ai/worklog/2026-08-05-release-pipeline.md`

## Docker

```sh
docker compose up -d --build api mcp
```

Docker Compose 从项目根 `.env` 读取配置。期望的 key 见 `.env.example`。`BLOB_ROOT` 在容器内固定为 `/data/blobs`，经 `blob-data` 卷持久化。`DATABASE_URL` 必填；entrypoint（`scripts/docker-entrypoint.sh`）把 localhost 数据库 host 重写为 `host.docker.internal` 供容器访问。`BLOB_SIGNING_SECRET`（≥32 字符）从 `.env` 贯通，是 `blob link` / 签名访问链接功能的必需项。

手动构建镜像以仓库根为 context：

```sh
docker build -t serenique-api -f services/api/Dockerfile .
docker build -t serenique-mcp -f services/mcp/Dockerfile .

docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://serenique:serenique@host:5432/serenique \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -v /host/path:/data/blobs \
  serenique-api
```

Dockerfile 默认值：`NODE_ENV=production`、`BLOB_ROOT=/data/blobs`、`BLOB_MAX_SIZE=104857600`（100 MB）、API `PORT=3000`、MCP `PORT=3001`、MCP `MCP_TRANSPORT=streamable-http`。
