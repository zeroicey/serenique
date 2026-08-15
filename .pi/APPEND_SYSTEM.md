# Serenique 项目工作准则

> 本文件是项目的唯一 agent 配置源（原 `AGENTS.md` / `CLAUDE.md` 已并入并精简，原文归档在 `.ai/archive/`）。跨 agent 通用约定与 pi 行为准则统一放这里。

## 语言与沟通

- 用中文回复；代码、标识符、commit message、API 响应保持英文
- 用户可见消息必须中文（API/CLI/Web 前端文案）
- 展示文件路径用相对仓库根的路径，不用绝对路径

## 项目背景

- Serenique 是个人日记与笔记服务。Monorepo 两类包：
  - `services/api` — REST API（Bun + Hono + Drizzle + PostgreSQL），服务层是唯一真相来源
  - `services/mcp` — **冻结（2026-08-08 sunset）**：不维护、不构建、不部署、不改动；「AI 工具暴露」需求走 CLI 或 API 服务层
  - `apps/cli` — Go CLI 客户端（cobra，仿 GitHub `gh`）
  - `apps/web` — React 浏览器端（React 19 + Vite + shadcn/ui + TanStack Query）

## 仓库布局与提交

- **绝不 stage/commit**：`.env`、`node_modules/`、`.omo/`、`.superpowers/`、`.worktrees/`、`.codegraph`；`.pi/decision-auditor/` 是运行时状态（gitignore），`.pi/` 其余（APPEND_SYSTEM.md、extensions/、agents/、skills/）纳入版本管理
- **Commit message 必须英文**（Conventional Commits：`feat:`/`fix:`/`docs:`/`chore:`…），仓库历史全英文；中文只进 `.ai/` 文档内容
- 提交前 `git status` 确认无脏文件

## 项目记忆（.ai/）

- `.ai/`（仓库根）是正式项目记忆，**纳入 git**：开始工作前先读 `.ai/README.md`（规则 + 目录职责），再扫一眼最近的 `.ai/worklog/`
- 近期记忆自动注入：`.pi/extensions/memory.ts` 每轮开始前把最近 worklog 主题 + 最新决策 + 未消化 inbox 摘要注入系统提示（只给钩子 ≤1.8KB，细节 read 原文）；会话中写了新记忆，下一轮自动刷新
- 自动捕获（事件级）由 context-mode 承担：`ctx_search` 检索决策/错误/阻塞/意图等事件记忆；`.ai/` 正式文档仍靠收尾规则人工沉淀
- 有实质产出的会话结束时：追加当日 `.ai/worklog/`（一天一个文件 `YYYY-MM-DD.md`，`##` 按主题；历史遗留的主题式文件 `YYYY-MM-DD-<slug>.md` 保留不动）
- 坑用 `⚠️` 标记；同一个坑踩第二次 → 升级到本文件的「已知陷阱」区
- 决策（含否决/延期）进 `.ai/decisions/` ADR 目录（一个主题一个文件，Why/How 结构），不在本文件堆细节
- 可复现流程写 `.ai/runbooks/`，worklog 只留一行指针
- `.ai/inbox/` 的片段消化进正式位置后删除（消化流程见 `.pi/skills/memory-consolidate/`）

## 命令

仓库根：

```sh
bun install          # 安装 workspace 依赖
bun run typecheck    # typecheck api + mcp + web
bun run lint         # biome check
```

API（在 `services/api/` 内）：

```sh
bun run dev          # hot-reload dev server (port 3000)
bun test             # API 单元测试
bun run typecheck    # api 包类型检查
bun run db:generate  # 生成 Drizzle 迁移（需 TTY）
bun run db:migrate   # 应用迁移
bun run db:push      # 直推 schema（CI 可用）
```

CLI（在 `apps/cli/` 内）：

```sh
make build           # 构建 bin/serenique
make install         # 安装到 /usr/local/bin
make test            # go test ./...（含 cmd）
go build ./... && go vet ./...   # 静态检查
```

网络注意：Go 模块走 China 镜像 `GOPROXY=https://goproxy.cn,direct`（proxy.golang.org 不通）；Docker 构建容器不能直连 npm registry，需注入 host proxy build args（见 `.ai/runbooks/docker-local-build.md`）。

## 核心不变量（改动不得破坏）

- **统一响应**：所有 API 响应 `{ success, code, message, data?, error? }`，用 `Res` builder（shared/response.ts）；handler 禁止直写 `c.json()`
- **错误契约**：业务错误抛 `AppError`（shared/errors.ts）；handler 统一转 HTTP：AppError→其 status、ZodError→400、SyntaxError→400、其余→500
- **模块骨架**：每模块固定文件集 `*.schema.ts / *.types.ts / *.domain.ts（纯逻辑禁 db/IO）/ *.mappers.ts / *.service.ts（单例只做编排）/ *.handler.ts / *.router.ts / index.ts`；service 不用 repository 接口/工厂/DI
- **数据库**：全仓唯一 `db` 连接（db/connection.ts），禁止第二连接池；新表必须注册进 `db/schema.ts`
- **契约锚定**：跨端字段以 `services/api` 源码为准——moment 用 `text`（不是 diary 的 `content`）、event 用 `title/startAt/endAt/isAllDay/location/note`（列表是**裸数组**）；`exports.ts` 导出面与被 `.extend()`/`.shape` 的 schema 不得随意改动
- **CLI 硬契约**（08-05 定稿）：错误必非零退出；结果走 stdout 错误走 stderr；token 输出（含 `--json`）必经 `maskToken()`；下载路径过 `filepath.Base()`；传输路径禁 `context.Background()`；config 文件 0600/目录 0700/原子写；CJK 截断用 `truncateRunes()`
- **认证**：WebAuthn Passkey（会话 cookie，HMAC 签名 `SESSION_SECRET`）+ Bearer API token（明文仅一次）；生产缺 `SESSION_SECRET`/`WEBAUTHN_RP_ID` 拒启动；注册门槛按凭证计数（0=需 `SETUP_TOKEN`，≥1=需会话）
- **测试**：两档——`*.service.test.ts` 纯函数单测（无 DB）+ `*.service.integration.test.ts` 真 PG（`RUN_DB_TESTS=1` 门控）

## 已知陷阱（⚠️ 踩过的坑）

- ⚠️ 字段命名：diary 用 `content`/`diaryDate`，moment 用 `text`——不要混
- ⚠️ 改 schema / API 前先读 `.ai/decisions/` 与 `.ai/architecture/` 最新文档，遵循已定决策
- ⚠️ `bun run db:generate` 需 TTY；迁移只走 drizzle-kit，不手工改库
- ⚠️ 发布是两步：`git push origin main`（→ docker `main` tag）→ `git tag vX.Y.Z && push`（→ 版本 tag + latest + CLI release）；tagging 是 CLI `--version` 注入前提
- ⚠️ 镜像非 root（UID 10001）：新 named volume 自动继承，旧 volume 需一次性 chown 否则写不了 `/data/blobs`
- ⚠️ bun `--production` 会冻结 lockfile，`--filter` 与 `--frozen-lockfile` 不兼容
- ⚠️ 图片识别：当前模型可能无原生识图，用 `.pi/skills/image-recognition/vision.js`（千问 VL，DashScope 按量付费），不要用 Read 直接读图
- ⚠️ 冒烟时 bun --hot 崩溃态：curl 超时先 kill 重启 dev server，不要反复重试

## Agent 团队（captain + 域专家协作）

主会话（pi）是 captain：分解需求 → 派发 `.pi/agents/*.md` 域专家子代理（可并行）→ 契约对齐（以 `services/api` 源码为准：字段名/响应形状/exports 导出面）→ 验收集成。`@agent-name` 可手动调用。

| Agent | 文件 | 领域 |
| --- | --- | --- |
| API Agent | `.pi/agents/api-agent.md` | `services/api`：REST、数据模型、服务层、测试、exports.ts |
| CLI Agent | `.pi/agents/cli-agent.md` | `apps/cli`：Go CLI |
| Web Agent | `.pi/agents/web-agent.md` | `apps/web`：React 浏览器端 |
| Deploy Agent | `.pi/agents/deploy-agent.md` | Docker、GitHub Actions、发布、服务器 |
| Flutter Agent | `.pi/agents/flutter-agent.md` | Flutter 移动端（iOS/Android） |

`services/mcp` 冻结，永不是受影响子系统；「AI 工具暴露」需求走 CLI 或 API 服务层。

## 子系统速览（细节指向 .ai/）

- **api**：模块结构、路由表、blob 存储层要点 → `.ai/architecture/`、`.ai/requirements/`、`.ai/README.md` 索引
- **cli**：架构定稿见 `.ai/architecture/2026-08-05-cli-tool-architecture-updates.md`；新增模块流程：`internal/client/<mod>.go` → `cmd/<mod>.go` → `cmd/root.go` 注册
- **web**：架构定稿见 `.ai/architecture/2026-08-05-web-frontend-architecture.md`；feature-first 目录结构，服务端数据只走 TanStack Query
- **发布**：完整流程见 `.ai/runbooks/release-process.md`、`.ai/runbooks/hpcore-deploy.md`；Docker 构建见 `.ai/runbooks/docker-local-build.md`
