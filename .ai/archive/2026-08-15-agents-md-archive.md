# 🪦 已废弃：AGENTS.md / CLAUDE.md 归档（2026-08-15 迁移 pi）

> **状态：🪦 已废弃（2026-08-15）**。项目从 opencode/Claude Code 迁移到 pi，两份文件被精简蒸馏进 `.pi/APPEND_SYSTEM.md` 后从仓库根删除。
> 本文件保留原文备查（信息兜底）；**当前生效规则以 `.pi/APPEND_SYSTEM.md` 为准**，详细架构/需求/决策见 `.ai/architecture/`、`.ai/requirements/`、`.ai/decisions/`、`.ai/runbooks/`。

## 归档说明

- 迁移日期：2026-08-15
- 替代者：`.pi/APPEND_SYSTEM.md`（精简版）+ `.ai/` 各正式文档
- `AGENTS.md`（2026-08-13 更新，336 行）与 `CLAUDE.md`（2026-08-10，387 行）是同一份项目指南的英文双版本，AGENTS.md 较新
- git 历史中仍可查两文件全文（`git log --oneline -- AGENTS.md` / `git show <commit>:AGENTS.md`）

## AGENTS.md 原文（2026-08-13）

# AGENTS.md

Serenique is a personal journaling and note-taking service. This file provides guidance for opencode when working in this repository.

## Project overview

Monorepo with two kinds of packages:

- `services/` — server-side processes:
  - `services/api` — REST API (Bun + Hono + Drizzle + PostgreSQL)
  - `services/mcp` — MCP server exposing the API's service layer to AI agents (**frozen — do not modify or schedule work on it**, see `.ai/decisions/2026-08-08-mcp-sunset.md`)
- `apps/` — client applications:
  - `apps/cli` — Go CLI client (cobra), modeled after GitHub `gh`, for use by humans and AI agents

**API stack:** Bun runtime, Hono web framework, PostgreSQL (Drizzle ORM), Zod validation, Pino logging, TypeScript strict.
**CLI stack:** Go (1.26+), cobra, yaml.v3.

Before modifying a subsystem, read the project memory `.ai/` first (see below).

## Project memory (`.ai/`)

The `.ai/` directory at the repo root is the project memory, treated as formal documentation. **It is an auto-capturing system**: skills + a plugin capture knowledge as work happens — read `.ai/README.md` first (index + rules), then the latest documents relevant to the change.

- `worklog/` — dated work logs: what was done, evaluated, and fixed each day, plus explicit pitfalls ("hints for the next session")
- `decisions/` — decision records with **Why** / **How to apply** rationale, including rejected/deferred options
- `requirements/` — requirement docs, each with a status line (✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决); status board in `requirements/README.md`
- `architecture/` — architecture design documents. Later documents supersede earlier ones (e.g. `2026-08-05-cli-tool-architecture-updates.md` explicitly marks the finalized CLI architecture)
- `runbooks/` — **standard procedures live here only** (hpcore deploy / web Cloudflare upload / iOS install / docker build / release). Worklogs never duplicate a procedure — they link to the runbook
- `archive/` — dead documents (implemented plans)
- `inbox/` — raw session captures from the memory plugin; consumed by the memory skills and emptied

Before starting work, read the latest documents relevant to the change. The CLI evaluation history and hardened contracts from 08-05 are in the worklog/architecture/decisions and have been distilled into the CLI section below.

### 项目记忆纪律（自动捕获）

| 场景 | 动作 |
| ------ | ------ |
| 解决新问题 / 踩坑 | 写 worklog（remember-worklog skill） |
| 完成珍贵/难的需求或流程 | 写 worklog + 可复现则写 runbook（remember-runbook skill） |
| 与用户讨论需求 | 边讨论边写 requirements（remember-requirement skill） |
| 做出决策 | 写 decisions（remember-decision skill） |

技能定义在 `.opencode/skills/remember-*`；memory 插件自动把会话片段写进 `.ai/inbox/`，由 memory-consolidate 整理。标准流程只放 `.ai/runbooks/`，worklog 不重复收录。

## AI agent team (multi-agent collaboration)

Serenique uses a "captain + domain-expert agent" collaboration model: the **main session (opencode build agent) is the captain**, responsible for decomposing requirements, dispatching work, acceptance, and integration; domain experts are `.opencode/agents/*.md` subagents (`mode: subagent`), dispatched on demand and possibly in parallel.

| Agent | File | Domain |
| ------- | ------ | -------- |
| API Agent | `.opencode/agents/api-agent.md` | `services/api`: REST, data models, service layer, tests, `exports.ts` |
| MCP Agent (disabled) | `.opencode/agents/mcp-agent.md` | `services/mcp` — frozen (MCP sunset 08-08); **do not dispatch** |
| CLI Agent | `.opencode/agents/cli-agent.md` | `apps/cli`: Go CLI client |
| Web Agent | `.opencode/agents/web-agent.md` | `apps/web`: React browser client |
| Deploy Agent | `.opencode/agents/deploy-agent.md` | Docker, GitHub Actions, releases, servers |
| Flutter Agent | `.opencode/agents/flutter-agent.md` | Flutter mobile (iOS/Android, planned) |

Dispatch rules: a single requirement often touches multiple subsystems (e.g. "adding a drive module" affects API + CLI + Web). **`services/mcp` is frozen (sunset 2026-08-08) and is never an affected subsystem** — "AI tool exposure" requirements go through the CLI or the API service layer instead. The captain first decomposes the affected subsystems, then **dispatches agents in parallel** (multiple Task tool calls in one message = parallel), each developing in its own domain; the captain owns cross-client contract alignment (with the `services/api` source as the source of truth: field names, response shapes, `exports.ts` export surface) and final acceptance. Manual invocation is possible via `@agent-name` in the conversation.

All agents share the captain's permissions (omitting the `permission` field = inheriting all tools), are restricted to each client's current tech stack, and are required to use the project memory (read `.ai/` before starting work, write to the worklog after finishing). See `.opencode/agents/README.md` for the team charter and `.ai/decisions/2026-08-06-ai-agent-team.md` for the decision record.

## Commands

Common commands at the repo root:

```sh
bun install          # install workspace dependencies
bun run typecheck    # typecheck api + mcp
bun test             # only runs services/mcp tests (bun run --cwd services/mcp test)
docker build -t serenique-api -f services/api/Dockerfile .
```

`bun test` at the root only covers the MCP service. API tests must be run inside `services/api/`.

API-specific commands (run inside `services/api/`):

```sh
bun install          # install dependencies
bun run dev          # hot-reload dev server (port 3000)
bun run start        # same as dev
bun test             # API unit/integration tests (bun test)
bun run typecheck    # typecheck the api package only
bun run db:generate  # generate Drizzle migrations from schema (requires TTY)
bun run db:migrate   # apply pending migrations
bun run db:push      # push schema directly to DB (skips migrations, CI-usable)
```

CLI commands (run inside `apps/cli/`):

```sh
make build           # build bin/serenique (version injected via ldflags)
make install         # copy the binary to /usr/local/bin
make build-all       # cross-compile for 5 platforms
make test            # go test ./... (runs cmd + internal packages)
go build ./...       # compile check
go vet ./...         # static check
go test -count=1 ./...  # full test run (-count=1 bypasses cache)
```

**Commit messages must be in English** (conventional-commit style: `feat:`, `fix:`, `docs:`, `chore:`, …) — the repo history is English-only, including `.ai/` and `docs/` commits. Chinese text belongs in `.ai/` doc content, never in commit messages.

Network note: pulling Go modules requires the China mirror `GOPROXY=https://goproxy.cn,direct` (`proxy.golang.org` is unreachable on this network).

Docker build network note: build containers cannot reach `registry.npmjs.org` directly — `docker build` fails at `bun install` with `ConnectionRefused`; inject the host proxy as build args (`host.docker.internal:7897`, Docker-predefined args, no Dockerfile changes). Full procedure: see `.ai/runbooks/docker-local-build.md`. Running an already-built image (`docker run`) doesn't need proxy args.

The runtime environment is passed via `docker run -e` flags (expected keys in `.env.example`). Per-service `.env` files are not used. Secrets never enter images; the root `.dockerignore` excludes `.env`.

## Architecture

### Monorepo layout

```
apps/cli/             Go CLI client (cobra) — see "CLI module" below
services/api/         REST API — Bun + Hono + Drizzle + PostgreSQL
services/mcp/         MCP server exposing the API service layer via streamable-http (frozen — see sunset decision)
scripts/              docker-entrypoint.sh (rewrites localhost DB host to host.docker.internal)
.ai/                  Project memory: worklog/ architecture/ decisions/ requirements/ runbooks/ archive/ inbox/
```

### services/api

```
services/api/src/
├── index.ts          — Entry point: validates env, initializes blob root, creates app
├── app.ts            — App factory: wires middleware, routes, error handling, 404
 ├── env.ts            — Zod-validated env (DATABASE_URL, BLOB_ROOT, BLOB_MAX_SIZE, BLOB_SIGNING_SECRET, SESSION_SECRET, SETUP_TOKEN, WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, WEBAUTHN_ORIGINS, SESSION_TTL, PORT, NODE_ENV, AI_SESSION_DIR, AI_MODEL)
├── exports.ts        — @serenique/api public workspace exports (service layer only, no Hono)
├── db/
│   ├── connection.ts — Single Drizzle client + Postgres connection pool (shared by all modules)
│   └── schema.ts     — Central schema registry; Drizzle Kit reads it to generate migrations
├── shared/
│   ├── errors.ts     — AppError class (codes: NOT_FOUND, VALIDATION, INTERNAL)
│   ├── logger.ts     — Pino logging (pino-pretty in dev, structured JSON in prod)
│   ├── response.ts   — Unified response builder: Res.ok(msg, data).build(c)
│   └── storage.ts    — Local disk I/O, SHA-256 checksums, image dimension extraction, blob root init
├── middleware/
│   ├── cors.ts       — CORS: permissive in dev, configurable via CORS_ORIGIN
│   ├── index.ts      — Middleware barrel exports
│   └── logger.ts     — Request logging (method, path, status, duration)
 └── modules/
    ├── blob/         — Generic binary storage layer (any MIME, SHA-256 dedup)
    ├── ai/           — AI assistant (宁序): PI SDK agent loop, business tools (defineTool → service layer), /api/ai/ws WebSocket chat, jsonl sessions in /data/sessions (see `.ai/requirements/2026-08-09-ai-agent-module.md`)
    ├── moment/       — Flash notes (≤10000 chars; field: text; media attachments via blob refs; `comment.*` nested self-comments, ≤2000 chars)
    ├── task/         — Task groups (custom) + simple tasks (fields: groupId/title/status; completedAt synced with status)
    └── event/        — Calendar events (fields: title/startAt/endAt/isAllDay/location/note; time-window list, bare array)
```

### Module structure

Every module has a fixed file set (core skeleton):

| File | Responsibility |
| ------ | ---------------- |
| `*.schema.ts` | Drizzle table definitions |
| `*.types.ts` | Zod validation schemas + input/output TS types |
| `*.service.ts` | Exports the **singleton** `xxxService`; orchestrates on top of `db` / `@/shared/*` / `@/env`; throws `AppError` |
| `*.handler.ts` | Zod-parses requests → calls service → builds `Res` response; unified error handling via `handleError` in `shared/handler.ts` |
| `*.router.ts` | Hono routes, mounted under `/api` |
| `index.ts` | Barrel re-export of routes |

When a module has pure business rules or row→entry conversions, put them in separate files to keep the service lean:

| File | Responsibility |
|------|----------------|
| `*.domain.ts` | Pure business rules/computation/validation — **no DB/IO imports**, millisecond-level unit tests |
| `*.mappers.ts` | row→entry conversions, pure functions |

Services do not use repository interfaces or factories/DI — the DB is an implementation detail of the service; testable logic is extracted into `*.domain.ts` pure functions.

Two-tier testing convention (see `.ai/decisions/2026-08-05-service-layer-architecture.md`):

| File | Responsibility |
|------|----------------|
| `*.service.test.ts` | Unit tests: domain pure functions + Zod schemas + mappers, no DB |
| `*.service.integration.test.ts` | Real PostgreSQL (real disk for blobs), gated by `RUN_DB_TESTS=1`, skipped otherwise |

Shared test helpers live in `src/test/helpers.ts`. To run: `cd services/api && bun test` (unit) or `bun run test:integration:full` (DB integration).

Each module is a self-contained Hono instance, assembled in `app.ts` via `app.route("/api", moduleRouter)`.

### Key patterns

- **App factory:** `createApp(env)` creates the app — env is parsed at import time in `index.ts`, crashing fast on invalid values
- **Startup initialization:** `index.ts` top-level awaits `initBlobRoot(env.BLOB_ROOT)` before creating the app, validating and creating the blob storage directory
- **Unified response shape:** all API responses use `{ success, code, message, data?, error? }`. Use the `Res` builder from `shared/response.ts` — handlers never call `c.json()` directly
- **Error handling:** services throw `AppError`; handlers catch and convert to responses; the global `onError` in `app.ts` catches any unhandled error and returns 500
- **Path aliases:** `@/*` → `./src/*` (configured in tsconfig.json)
- **Database:** the whole repo uses only the single `db` export from `db/connection.ts`; no second connection pool is allowed. The central `db/schema.ts` re-exports all table definitions — Drizzle Kit reads this file, so every new table must be exported there
- **env in services:** services that need environment variables (e.g. `blob.service.ts` needs `BLOB_ROOT`/`BLOB_MAX_SIZE`) import directly from `@/env` — allowed when the service is tightly coupled to environment config
- **Workspace exports:** `src/exports.ts` is the `@serenique/api` package entry point — re-exports the service layer, Zod schemas, and shared utilities (no handler/router/middleware). Keep the export surface small and typed; external consumers share the same DB connection

### Blob module (low-level binary storage)

The blob module serves as a **shared storage layer** for other modules (diary, moment, and future ones like drive/netdisk). No business-level file type restrictions — any MIME type is accepted.

- **Disk layout:** `{BLOB_ROOT}/objects/{mime-main-type}/{YYYY}/{MM}/{uuid}.{ext}`. Reads/deletes also fall back to the old direct-root layout for compatibility
  - Example: `objects/image/2026/08/a1b2c3d4.jpg`, `objects/application/2026/08/b2c3d4e5.pdf`
- **Deduplication:** SHA-256 checksum + unique constraint on the `checksum` column. Re-uploading the same file returns the existing record without writing to disk
- **Metadata:** extensible `jsonb` column (EXIF, encoding info, custom tags). Not validated — consuming modules define their own conventions
- **Image dimensions:** extracted from binary headers at upload time (JPEG/PNG/GIF/WebP), zero dependencies
- **Attachments:** `blob_attachments` stores business-level references separately (`ownerType`, `ownerId`, `role`, ordering, display name, metadata), decoupled from the physical `blobs`. Consuming modules should attach existing blobs rather than duplicating file metadata
- **Consistency cleanup:** if the DB insert fails after writing to disk, the just-written file is deleted. A maintenance endpoint can delete orphaned disk files not referenced by any `blobs.storage_path`
- **File transfer:** downloads return filesystem-backed `Blob` bodies (no whole-file `Buffer`), with single-`Range` support returning `206 Partial Content`
- **Signed access:** `POST /api/blobs/:id/access-link` generates an HMAC link (`/api/blobs/:id/file?expires=&signature=`) when `BLOB_SIGNING_SECRET` is configured. Direct file access remains possible until auth middleware is added
- **File operations:** blob deletion is physical, allowed only when no attachment references it. Attachment deletion removes only the reference. Physical deletion removes the DB record first, then attempts the disk (disk failures are logged, non-fatal)

### API routes

| Method | Path | Module |
| -------- | ------ | -------- |
| GET | `/health` | Health check |
| GET | `/` | API info |
| POST | `/api/auth/register/start` | WebAuthn 注册开始（body: `{ setupToken? }`；凭证计数 0=引导期需 SETUP_TOKEN，≥1=需会话添加新设备；users 行须已由引导脚本创建） |
| POST | `/api/auth/register/finish` | 注册完成（校验 attestation → 建凭证 → 自动登录发 cookie） |
| POST | `/api/auth/login/start` | WebAuthn 登录开始（返回 challenge + allowCredentials） |
| POST | `/api/auth/login/finish` | 登录完成（校验签名 + counter → 发会话 cookie） |
| POST | `/api/auth/logout` | Logout (clears the cookie) |
| GET | `/api/auth/me` | 会话状态 + 用户信息（`{ authenticated, user }`） |
| GET, DELETE | `/api/auth/credentials[/:id]` | 凭证列表 / 删除（删最后一把 → 409） |
| GET, PUT | `/api/users/me` | 个人信息读/改（name/email/birthday，需会话） |
| POST, GET, DELETE | `/api/tokens[/:id]` | API token 创建（明文仅一次）/ 列表（仅 prefix）/ 撤销 |
| GET, POST | `/api/diaries` | List / create diaries |
| GET | `/api/diaries/by-date/:date` | Get diary by date (404 if none; registered before `:id`) |
| GET, PUT, DELETE | `/api/diaries/:id` | Diary detail / update / delete |
| GET, POST | `/api/moments` | List (`?page=&pageSize=&q=&tag=&createdFrom=&createdTo=`，createdFrom/createdTo 为 ISO 时间窗，半开区间 `[from, to)`，与 `page/pageSize` 正交) / create moments (creation may include optional `attachments[]`) |
| GET, PUT, DELETE | `/api/moments/:id` | Moment detail / update / delete |
| POST, DELETE | `/api/moments/:id/attachments[/:attachmentId]` | Create / delete moment attachments |
| GET, POST | `/api/moments/:id/comments` | List / create moment comments (body `{ content }`, ≤2000) |
| PUT, DELETE | `/api/moments/:id/comments/:commentId` | Update / delete moment comments |
| POST | `/api/blobs/upload` | Blob upload (multipart, field: `file`) |
| POST | `/api/blobs/cleanup-orphans` | Delete disk files not referenced by any blob row |
| GET | `/api/blobs` | Blob list (`?mimeType=image/&page=&pageSize=`) |
| GET | `/api/blobs/:id` | Blob metadata |
| GET | `/api/blobs/:id/file` | Blob download/preview (`?download=1` forces attachment) |
| POST | `/api/blobs/:id/access-link` | Create temporary signed access link |
| DELETE | `/api/blobs/:id` | Blob delete (DB + disk) |
| POST, GET | `/api/blobs/:id/attachments` | Create / list blob attachment references |
| DELETE | `/api/blob-attachments/:id` | Delete attachment reference only |
| GET, POST | `/api/task-groups` | List / create task groups |
| GET, PUT, DELETE | `/api/task-groups/:id` | Task group detail / rename / delete |
| GET, POST | `/api/tasks` | Task list (`?groupId=&status=`) / create |
| GET, PUT, DELETE | `/api/tasks/:id` | Task detail / update (status syncs `completedAt`) / delete |
| GET, POST | `/api/events` | Event list (`?from=&to=` time window, **bare array**) / create |
| GET, PUT, DELETE | `/api/events/:id` | Event detail / partial update / delete |
| WS | `/api/ai/ws` | AI assistant (宁序) WebSocket chat: session CRUD + prompt/steer/followUp/abort, streaming events (see `.ai/requirements/2026-08-09-ai-agent-module.md`) |

Field naming pitfall: diary uses `content`/`diaryDate`, but moment uses `text` — don't mix them up. The CLI contract follows the API source: the moment body is `{ "text": ... }`. event uses `title`/`startAt`/`endAt`/`isAllDay`/`location`/`note`; its list returns a **bare array** for time-window queries (not `{ items, total }`).

User-visible messages must be in Chinese.

### Authentication (Passkey + API tokens)

Standard **WebAuthn (Passkey)** authentication with manageable API tokens for CLI/scripts (see `.ai/requirements/2026-08-09-passkey-auth.md`). Single-user design (部署者本人), multi-device via multiple passkey credentials.

- **Browser (Web):** `navigator.credentials` ceremony against `/api/auth/register/*` (bootstrap-phase registration requires `SETUP_TOKEN`) and `/api/auth/login/*` → HttpOnly **HMAC-signed cookie** (`serenique_session`, stateless, signed with `SESSION_SECRET`, payload carries `userId`; no session table). **No public first registration** — the `users` row is created by the bootstrap script (`bun scripts/bootstrap-user.ts`, idempotent, args/env `FIRST_USER_*`; only needs `DATABASE_URL`); auth enabled + empty `users` table → API refuses to start (fail-closed). Frontend has no registration form, only the hidden `/setup?setupToken=` page for the first passkey
- **CLI / scripts / mobile:** `Authorization: Bearer <API token>` — tokens created via `POST /api/tokens` (GitHub PAT mode: plaintext shown once, only SHA-256 hash stored, `revoked_at` soft-revoke)
- **env:** `SESSION_SECRET` (cookie signing), `SETUP_TOKEN` (bootstrap registration; removable after first registration), `FIRST_USER_NAME/FIRST_USER_EMAIL/FIRST_USER_BIRTHDAY` (bootstrap script), `WEBAUTHN_RP_ID` (RP ID = **front-end domain**, not the API domain; changing it invalidates all passkeys), `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS` (comma-separated ceremony origin allowlist)
- **Middleware allowlist:** `/health`, `/`, `/api/auth/register/start|finish`, `/api/auth/login/start|finish`, `/api/auth/logout`, signed blob file links (`/api/blobs/:id/file?expires=&signature=`). Ceremony endpoints still resolve session vars best-effort (add-device flow needs the logged-in userId)
- **Challenges:** single-process in-memory Map, 5-minute TTL, one-time consume
- **Key rotation = sessions invalidated:** changing `SESSION_SECRET` and restarting invalidates all old cookies; revoking a token kills that Bearer immediately
- **Registration gate (credential-count based):** `passkey_credentials` count == 0 → `SETUP_TOKEN` constant-time compare required (bootstrap phase; the `users` row must already exist via the bootstrap script, else 500 with a script hint); count ≥ 1 → session required (same endpoint adds a new device credential). Deleting the last credential → 409
- **Login counter:** strict monotonic check (new counter > stored counter) — regression = clone suspicion, audited
- **Fail-closed:** production refuses to start without `SESSION_SECRET` + `WEBAUTHN_RP_ID`, and with auth enabled + empty `users` table (hint: run `bun scripts/bootstrap-user.ts` first); dev skips auth entirely when `WEBAUTHN_RP_ID` is unset (zero friction)
- Session cookies default to 30 days (`SESSION_TTL`, in seconds). Production cross-origin setups (e.g. pages.dev → api.zeroicey.me) need `CORS_ORIGIN` explicitly set to the web domain — credentialed cross-origin requests do not allow `*`
- **审计:** 登录成功/失败、注册、token 创建/撤销、凭证删除 → `auditLogs`（`auth.*` / `token.*` 事件）

### services/mcp (frozen)

**停更冻结（sunset — see `.ai/decisions/2026-08-08-mcp-sunset.md`）**: the code stays in the repo but is **not maintained, not built, not deployed, and not modified**. Never schedule requirements, fixes, or tool changes for `services/mcp`, and do not "keep it compiling" when the API surface changes — nothing consumes it anymore. "AI tool exposure" requirements go through the CLI (`apps/cli`) or the API service layer. (Historical context: it was a Bun + `@modelcontextprotocol/sdk` server calling the API service layer via `@serenique/api`.)

### CLI module (`apps/cli`)

Go + cobra CLI (like `gh`). Dependency direction: `cmd/` (cobra commands) → `internal/{config,client,output}` — the three internal packages are independent of each other. Configuration lives in `~/.serenique/config.yaml`, with precedence CLI flag > env (`SERENIQUE_BASEURL`/`SERENIQUE_TOKEN`) > file > default. `--json`/`-j` switches `output.Printer` to machine-readable JSON.

Hard contracts finalized in the 08-05 evaluation — must not regress:

- **Errors must exit non-zero.** Every `RunE` returns an error; never `return nil` on failure. `rootCmd` uses `SilenceUsage` + `SilenceErrors`, so errors are rendered exactly once
- **Clean stdout.** Results (table, or a single JSON document under `--json`) → stdout; progress/confirmation/errors → stderr. Prefer `output.Printer`; never raw `fmt.Printf` to stdout
- **Token masking.** Any token output — including `--json` (machine-consumed mode) — goes through `maskToken()`
- **The API contract is defined by the `services/api` workspace source**, not the running container. The moment field is `text`; when backend fields change, sync the CLI struct's `json:"..."` tags
- **Download path sanitization.** Default filenames must go through `filepath.Base()`; never `os.Create(originalName)` directly (path traversal)
- **Cancellable + bounded transfers.** The root context is derived from `signal.NotifyContext(os.Interrupt, SIGTERM)`; the transfer client sets `ResponseHeaderTimeout`. `context.Background()` is banned on transfer paths
- **Config security.** Files `0600`, directories `0700`, atomic writes (temp+rename), symlink-safe chmod. New config fields must flow through `Resolve`, precedence, and the `config set` allowlist
- **Confirmation prompts.** Use `helpers.confirm()` — prompt on stderr; in non-interactive mode, EOF on stdin counts as "not confirmed" → error → exit non-zero
- **CJK-safe truncation.** Use `truncateRunes()`, never slice strings by byte
- **`List` is a generic free function, not a method** (Go forbids generic methods on non-generic receiver types)
- **Full verification** is `go build ./... && go vet ./... && go test -count=1 ./...` (`make test` runs `go test ./...`, including `cmd/`)

Adding a new module (e.g. drive): `internal/client/drive.go` (typed methods) → `cmd/drive.go` (cobra command) → register in `cmd/root.go`. Nothing else needs to change.

## Release / publishing process

Versions come from git tags (`vX.Y.Z`) — the CLI's `--version` is injected from the tag (`git describe --tags` / `GITHUB_REF_NAME` in CI), so **tagging is a prerequisite for releases**. All releases go through GitHub Actions, in two steps:

```sh
# 1. Commit and push main → docker-publish pushes zeroicey/serenique-api:main (MCP image no longer built — sunset)
git push origin main

# 2. Tag a version and push → triggers both docker-publish (version tag + latest) and release-cli (GitHub Release)
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

- `.github/workflows/docker-publish.yml` — multi-arch (linux/amd64+arm64) builds pushed to Docker Hub. Tag `v*` → `{version}` / `v{version}` / `latest`; main push → `main`; supports `workflow_dispatch`. Requires GitHub secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (a Docker Hub access token, **unrelated to `gh`'s GitHub login**)
- `.github/workflows/release-cli.yml` — on tag `v*`, cloud-compiles 5 platforms (matching Makefile `build-all`) + `checksums.txt` + `gh release create --generate-notes`
- Docker Hub namespace: `zeroicey` — `zeroicey/serenique-api` only (`serenique-mcp` is no longer built/pushed, see the MCP sunset decision)
- Images run as **non-root (UID 10001)**: fresh named volumes automatically inherit the in-image owner; existing volumes need a one-time chown to 10001 (`docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`), otherwise the container can't write to `/data/blobs`
- Full release runbook (Docker Hub secrets, UID 10001 chown, key pitfalls like bun `--production` freezing the lockfile): see `.ai/runbooks/release-process.md`; server-side deployment: see `.ai/runbooks/hpcore-deploy.md`

## Docker

The repo has no docker-compose file; images are built and run directly with the repo root as the build context:

```sh
docker build -t serenique-api -f services/api/Dockerfile .

docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://serenique:serenique@host:5432/serenique \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -e BLOB_SIGNING_SECRET=<32+ chars> \
  -e SESSION_SECRET=<32+ chars> \
  -e SETUP_TOKEN=<32+ chars> \
  -e WEBAUTHN_RP_ID=your-web-domain \
  -e WEBAUTHN_ORIGINS=https://your-web-domain \
  -e CORS_ORIGIN=https://your-web-domain \
  -e OPENCODE_API_KEY=<key> \
  -e AI_MODEL=opencode-go/deepseek-v4-flash \
  -v /host/path:/data/blobs \
  -v /host/sessions:/data/sessions \
  serenique-api
```

The `-e` env keys are documented in `.env.example`. `BLOB_ROOT` is fixed at `/data/blobs` inside the container, persisted via a host volume. `DATABASE_URL` is required; the entrypoint (`scripts/docker-entrypoint.sh`) rewrites the localhost database host to `host.docker.internal` for container access. `BLOB_SIGNING_SECRET` (≥32 chars) is required for the `blob link` / signed access link feature. Passkey auth is optional in dev (skipped when `WEBAUTHN_RP_ID` is unset), required in production (fail-closed on missing `SESSION_SECRET` / `WEBAUTHN_RP_ID`). `SETUP_TOKEN` is only needed until the first registration completes, then it can be removed from the env. Before the first registration, the `users` row must be created via the bootstrap script (`docker compose run --rm api bun scripts/bootstrap-user.ts`, image includes `services/api/scripts/`); note `docker compose run` overrides `CMD`, so the entrypoint's localhost→`host.docker.internal` rewrite won't run — point `DATABASE_URL` at a host-reachable address.

Dockerfile defaults: `NODE_ENV=production`, `BLOB_ROOT=/data/blobs`, `BLOB_MAX_SIZE=104857600` (100 MB), API `PORT=3000`, MCP `PORT=3001`, MCP `MCP_TRANSPORT=streamable-http`.

## CLAUDE.md 原文（2026-08-10）

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Serenique is a personal journaling and note-taking API. It is a monorepo with two kinds of packages:

- `services/` — server-side processes:
  - `services/api` — the REST API (Bun + Hono + Drizzle + PostgreSQL)
  - `services/mcp` — an MCP server exposing the API's service layer to AI agents (**frozen — do not modify or schedule work on it**, see `.ai/decisions/2026-08-08-mcp-sunset.md`)
- `apps/` — client-side applications:
  - `apps/web` — React browser app (React 19 + Vite + TanStack Query + Zustand + shadcn/ui)
  - `apps/cli` — a Go CLI client (cobra), modeled after GitHub's `gh`, for humans and AI agents
  - `apps/mobile` — Flutter mobile app (iOS/Android, in development)

**API stack:** Bun runtime, Hono web framework, PostgreSQL via Drizzle ORM, Zod validation, Pino logging, TypeScript with strict mode.
**Web stack:** React 19 + Vite + TanStack Query v5 + Zustand v5 + shadcn/ui.
**CLI stack:** Go (1.26+), cobra, yaml.v3.
**Mobile stack:** Flutter (iOS/Android), dio + web_socket_channel.

Before starting work on a subsystem, read the project memory in `.ai/` (below). A `SessionStart` hook auto-injects a memory digest into context at session start (see "记忆纪律" below).

## Project memory (`.ai/`)

`.ai/` at the repo root is the project's memory — treat it as documentation of record. **It is an auto-capturing system**: hooks + skills capture knowledge as work happens. Read `.ai/README.md` first (index + rules), then the latest documents relevant to the change.

- `worklog/` — dated work logs: what was built, evaluated, and fixed each day, plus explicit pitfalls ("tips for the next session").
- `decisions/` — decision records with **Why** / **How to apply** rationale, including rejected/deferred options.
- `requirements/` — requirement docs, each with a status line (✅已实施 / ⏳待实施 / 🔶设计中 / 🪦已否决); status board in `requirements/README.md`.
- `architecture/` — architecture design docs. Later docs supersede earlier ones (e.g. `2026-08-05-cli-tool-architecture-updates.md` explicitly marks itself as the finalized CLI architecture over the 08-04 design).
- `runbooks/` — **standard procedures live here only** (deploy / upload / install / build / release). Worklogs never duplicate a procedure — they link to the runbook.
- `archive/` — dead documents (implemented plans).
- `inbox/` — raw session captures from the memory hooks; consumed by the memory skills and emptied.

### 记忆纪律（自动捕获）

| 场景 | 动作 |
| ------ | ------ |
| 解决新问题 / 踩坑 | 写 worklog（`remember-worklog` skill） |
| 完成珍贵/难的需求或流程 | 写 worklog + 可复现则写 runbook（`remember-runbook` skill） |
| 与用户讨论需求 | 边讨论边写 requirements（`remember-requirement` skill） |
| 做出决策 | 写 decisions（`remember-decision` skill） |

自动化（Claude Code 原生 hooks，配置见 `.claude/settings.json`，脚本见 `.claude/hooks/`）：

- `SessionStart` — 自动读取 `.ai/README.md` + 最新 worklog + 未消化 inbox，注入上下文。
- `Stop` — 每轮实质对话后，把最后一条 assistant 消息捕获到 `.ai/inbox/YYYY-MM-DD.md`（按消息去重）。

纪律：

- 技能定义在 `.claude/skills/remember-*`；`memory-consolidate` skill 手动整理 inbox。
- **先去重再写**：同主题文档已存在 → 更新不新建；写完更新 `.ai/README.md` 索引 + 清空已消化的 `inbox/` 片段。
- 标准流程只放 `.ai/runbooks/`，worklog 不重复收录。
- **Commit messages 一律英文**（conventional-commit：`feat:`/`fix:`/`docs:`/`chore:`…）。中文只出现在 `.ai/` 文档内容里，绝不进 commit message。

## AI agent team (multi-agent collaboration)

Serenique uses a "captain + domain-expert agents" collaboration model: **the main session (Claude Code) is the captain**, responsible for breaking down requirements, dispatching work, acceptance, and integration. Domain experts exist as subagents in `.claude/agents/*.md`, dispatched on demand and able to run in parallel.

| Agent | File | Domain |
| ------- | ------ | -------- |
| API Agent | `.claude/agents/api-agent.md` | `services/api`: REST, data models, service layer, tests, `exports.ts` |
| MCP Agent (disabled) | `.claude/agents/mcp-agent.md` | `services/mcp` — frozen (MCP sunset 08-08); **do not dispatch** |
| CLI Agent | `.claude/agents/cli-agent.md` | `apps/cli`: Go command-line client |
| Web Agent | `.claude/agents/web-agent.md` | `apps/web`: React browser app |
| Deploy Agent | `.claude/agents/deploy-agent.md` | Docker, GitHub Actions, releases, servers |
| Flutter Agent | `.claude/agents/flutter-agent.md` | Mobile Flutter (iOS/Android, in development) |

Dispatching rule: a requirement often touches multiple subsystems at once (e.g. "adding a drive module" involves API + CLI + Web). **`services/mcp` is frozen (sunset 2026-08-08) and is never an affected subsystem** — "AI tool exposure" requirements go through the CLI or the API service layer instead. The captain first breaks down which subsystems are affected, then **dispatches the relevant agents in parallel**, each developing within its own domain; the captain owns cross-client contract alignment (with the `services/api` source as the source of truth: field names, response shapes, the `exports.ts` export surface) and final acceptance.

All agents have the same permissions as the captain (omitting the `tools` field = inheriting all tools), the tech stacks are constrained to each client's current stack, and using the project memory is mandatory (read `.ai/` before starting work, write to the worklog via `remember-worklog` after finishing). Team charter: `.claude/agents/README.md`; decision record: `.ai/decisions/2026-08-06-ai-agent-team.md`.

## Commands

Common commands from the repository root:

```sh
bun install          # Install workspace deps
bun run typecheck    # Type-check api + mcp
bun test             # Runs ONLY services/mcp tests (bun run --cwd services/mcp test)
docker build -t serenique-api -f services/api/Dockerfile .
```

`bun test` at the root only covers the MCP service. API tests run from `services/api/`.

API-specific commands run from `services/api/`:

```sh
bun install          # Install dependencies
bun run dev          # Start dev server with hot reload (port 3000)
bun run start        # Same as dev
bun test             # API unit/integration tests (bun test)
bun run typecheck    # Type-check the api package alone
bun run db:generate  # Generate Drizzle migrations from schema changes (requires TTY)
bun run db:migrate   # Apply pending migrations to the database
bun run db:push      # Push schema directly to DB (bypasses migrations, works in CI)
bun scripts/bootstrap-user.ts  # Create the first users row (idempotent). Users are NOT created by the register endpoint — see Authentication
```

CLI commands run from `apps/cli/`:

```sh
make build           # Build bin/serenique (version injected via ldflags)
make install         # Copy binary to /usr/local/bin
make build-all       # Cross-compile for 5 platforms
make test            # go test ./... (runs cmd + internal packages)
go build ./...       # Compile check
go vet ./...         # Static check
go test -count=1 ./...  # Full test run (use -count=1 to bypass cache)
```

Mobile commands run from `apps/mobile/`:

```sh
flutter analyze      # Static analysis
flutter test         # Dart/Flutter unit + widget tests
```

Network note: pulling Go modules requires the China mirror `GOPROXY=https://goproxy.cn,direct` (`proxy.golang.org` is unreachable on this network).

Docker build network note: the build container cannot reach `registry.npmjs.org` directly — `docker build` fails at `bun install` with `ConnectionRefused` on every tarball. Rebuild with the host proxy injected as build args (Docker's predefined proxy args, no Dockerfile change):

```sh
docker build --build-arg http_proxy=http://host.docker.internal:7897 \
  --build-arg https_proxy=http://host.docker.internal:7897 \
  --build-arg no_proxy=localhost,127.0.0.1 \
  -t serenique-api -f services/api/Dockerfile .
```

`host.docker.internal:7897` is the host's local HTTP proxy (see the `http_proxy` env on this machine); adjust the port if it changes. Running an already-built image (`docker run`) does not need it — only rebuilds. The Dockerfile itself stays registry-agnostic so it builds on any network. Full procedure: `.ai/runbooks/docker-local-build.md`.

The runtime environment is passed via `docker run -e` flags (expected keys in `.env.example`). Service-local `.env` files are not used. Keep secrets out of images; root `.dockerignore` excludes `.env` files from the build context.

## Architecture

### Monorepo layout

```
apps/cli/             Go CLI client (cobra) — see "CLI module" below
apps/web/             React browser app (Vite + TanStack Query + shadcn/ui)
apps/mobile/          Flutter mobile app (iOS/Android, in development)
services/api/         REST API — Bun + Hono + Drizzle + PostgreSQL
services/mcp/         MCP server exposing API service layer over streamable-http (frozen — see sunset decision)
scripts/              docker-entrypoint.sh (rewrites localhost DB host to host.docker.internal)
.ai/                  Project memory: worklog/ decisions/ requirements/ architecture/ runbooks/ archive/ inbox/
```

### services/api

```
services/api/src/
├── index.ts          — Entry point: validates env, initialises blob root, creates app
├── app.ts            — App factory: wires middleware, routes, error handler, 404
├── env.ts            — Zod-validated env (DATABASE_URL, BLOB_ROOT, BLOB_MAX_SIZE, BLOB_SIGNING_SECRET, SESSION_SECRET, SETUP_TOKEN, WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, WEBAUTHN_ORIGINS, SESSION_TTL, AUDIT_RETENTION_DAYS, AUDIT_MAX_ROWS, AI_SESSION_DIR, AI_MODEL, PORT, NODE_ENV)
├── exports.ts        — Public workspace exports for @serenique/api (service layer only, no Hono)
├── db/
│   ├── connection.ts — Single Drizzle client + Postgres pool (shared across all modules)
│   └── schema.ts     — Central schema registry that Drizzle Kit reads for migrations
├── shared/
│   ├── errors.ts     — AppError class (codes: NOT_FOUND, VALIDATION, INTERNAL)
│   ├── logger.ts     — Pino logger (pino-pretty in dev, structured JSON in prod)
│   ├── response.ts   — Unified API response builder: Res.ok(msg, data).build(c)
│   └── storage.ts    — Local disk I/O, SHA-256 checksum, image dimension extraction, blob root init
├── middleware/
│   ├── cors.ts       — CORS: permissive in dev, configurable via CORS_ORIGIN
│   ├── index.ts      — Barrel export for middleware
│   └── logger.ts     — Request logging (method, path, status, duration)
└── modules/
    ├── ai/           — AI assistant (宁序): PI SDK agent loop, business tools (defineTool → service layer), /api/ai/ws WebSocket chat, jsonl sessions in AI_SESSION_DIR (see `.ai/requirements/2026-08-09-ai-agent-module.md`)
    ├── audit/        — Server-side audit logs (auth.* / token.* events; retention sweep via AUDIT_RETENTION_DAYS / AUDIT_MAX_ROWS)
    ├── auth/         — WebAuthn (passkey) auth + users/me profile + credentials
    ├── tokens/       — API token create/list/revoke (Bearer auth for CLI/mobile)
    ├── blob/         — Generic binary storage layer (all MIME types, SHA-256 dedup)
    ├── moment/       — Flash notes (≤10000 chars; field: text; media attachments via blob refs; nested self-comments in `comment.*`, ≤2000 chars; tags)
    ├── tag/          — Tag CRUD + attach/detach (shared by moments)
    ├── task/         — Task groups (custom) + simple tasks (fields: groupId/title/status; completedAt synced by status)
    └── event/        — Calendar events (fields: title/startAt/endAt/isAllDay/location/note; time-range list, bare array)
```

> **`diary` was removed on 2026-08-09** (merged into moment). Do not reintroduce it — see `.ai/worklog/2026-08-09-api-remove-diary-module.md`.

#### AI 助手模块（宁序）

A WebSocket-based AI chat assistant inside the API (no separate service). Key facts:

- Endpoint: `WS /api/ai/ws` — session CRUD + `prompt`/`steer`/`followUp`/`abort`, streaming events over a text/JSON protocol.
- Runs a **PI SDK agent loop** with business tools defined via `defineTool` calling the same service layer other modules use.
- Sessions are persisted as **jsonl files** in `AI_SESSION_DIR` (default: prod `/data/sessions`, dev `./.data/sessions`), not in the DB.
- Env: `AI_SESSION_DIR` (optional), `AI_MODEL` (optional, default `opencode-go/deepseek-v4-flash`). The model credential **`OPENCODE_API_KEY` is read by the PI SDK directly from `process.env`** — it is intentionally NOT in the env schema (see `src/env.ts`).

### Module structure

Every module follows the same file set (core skeleton):

| File | Purpose |
| ------ | --------- |
| `*.schema.ts` | Drizzle table definition |
| `*.types.ts` | Zod validation schemas + TypeScript types for inputs/outputs |
| `*.service.ts` | Exports a **singleton** `xxxService`; orchestration over `db` / `@/shared/*` / `@/env`; throws `AppError` |
| `*.handler.ts` | Parses request with Zod → calls service → builds `Res` response; errors via shared `handleError` from `shared/handler.ts` |
| `*.router.ts` | Hono router with RESTful routes, mounted under `/api` |
| `index.ts` | Barrel re-export of the router |

When a module has pure business rules or row→entry conversion, they live in dedicated files so the service stays thin:

| File | Purpose |
|------|---------|
| `*.domain.ts` | Pure business rules/calculations/validations — **no DB/IO imports**, unit-testable in milliseconds |
| `*.mappers.ts` | row→entry conversion, pure functions |

Special files: `auth/*.domain.ts` + `auth.flows.ts` hold passkey/credential logic; `ai/` adds `ai.tools.ts` (business tools) and `ai.system-prompt.ts` (prompt building).

Services never use repository interfaces or factories/DI — the DB is an implementation detail of the service, and testable logic is extracted as pure functions into `*.domain.ts`.

Tests follow a two-tier convention (see `.ai/decisions/2026-08-05-service-layer-architecture.md`):

| File | Purpose |
|------|---------|
| `*.service.test.ts` | Unit tests: domain pure functions + Zod schemas + mappers, no DB |
| `*.service.integration.test.ts` | Real PostgreSQL (+ real disk for blob), gated by `RUN_DB_TESTS=1`, skipped otherwise |

Shared test helpers live in `src/test/helpers.ts`. Run `cd services/api && bun test` (unit) or `bun run test:integration:full` (DB-backed).

Each module is a self-contained Hono instance. Modules are wired in `app.ts` via `app.route("/api", moduleRouter)`.

### Key patterns

- **App factory:** The app is created by `createApp(env)` — env is parsed at import time in `index.ts` and crashes fast if invalid.
- **Startup init:** `index.ts` calls `initBlobRoot(env.BLOB_ROOT)` with a top-level await before creating the app. This validates the blob storage directory and creates it if missing.
- **Unified response shape:** All API responses use `{ success, code, message, data?, error? }`. Use the `Res` builder from `shared/response.ts` — never call `c.json()` directly in handlers.
- **Error handling:** Services throw `AppError`. Handlers catch and convert to responses. A global `onError` in `app.ts` catches anything unhandled and returns a 500.
- **Path alias:** `@/*` maps to `./src/*` (configured in `tsconfig.json`).
- **Database:** The single `db` export from `db/connection.ts` is used everywhere. Never create a second connection pool. The central `db/schema.ts` re-exports all table definitions — Drizzle Kit reads this file, so every new table must be exported there.
- **Env in services:** Services that need environment variables (like `blob.service.ts` needing `BLOB_ROOT` and `BLOB_MAX_SIZE`) import `env` directly from `@/env`. This is acceptable when the service is tightly coupled to the environment config.
- **Workspace export:** `src/exports.ts` is the `@serenique/api` package entry point — it re-exports service layers, Zod schemas, and shared utilities (no handlers, routers, or middleware). Keep the exported surface small and typed; external consumers share the same DB connection.

### Blob module (low-level binary storage)

The blob module is intended as a **shared storage layer** for other modules (moment, and future modules like drive/netdisk). It has no business-level constraints on file types — any MIME type is accepted.

- **Disk layout:** `{BLOB_ROOT}/objects/{mime-main-type}/{YYYY}/{MM}/{uuid}.{ext}`. Reads/deletes also fall back to the old direct-root layout for compatibility.
  - Example: `objects/image/2026/08/a1b2c3d4.jpg`, `objects/application/2026/08/b2c3d4e5.pdf`
- **Deduplication:** SHA-256 checksum with a unique constraint on the `checksum` column. Uploading the same file twice returns the existing record without writing to disk.
- **Metadata:** `jsonb` column for extensible metadata (EXIF, codec info, custom tags). Not validated — left to consumer modules to define their own conventions.
- **Image dimensions:** Extracted from binary headers (JPEG/PNG/GIF/WebP) at upload time with zero dependencies.
- **Attachments:** `blob_attachments` stores business-level references (`ownerType`, `ownerId`, `role`, ordering, display name, metadata) separately from physical `blobs`. Consumer modules should attach existing blobs instead of duplicating file metadata.
- **Consistency cleanup:** If DB insertion fails after writing a file, the just-written disk file is removed. A maintenance endpoint can delete orphan disk files that are not referenced by any `blobs.storage_path` row.
- **File transfer:** Downloads return filesystem-backed `Blob` bodies instead of materializing the whole file into a `Buffer`, and support single `Range` requests with `206 Partial Content`.
- **Signed access:** `POST /api/blobs/:id/access-link` creates HMAC links for `/api/blobs/:id/file?expires=&signature=` when `BLOB_SIGNING_SECRET` is configured. Direct file access remains available until auth middleware is added.
- **File operations:** Blob deletes are physical deletes and are allowed only when no attachment references remain. Attachment deletes remove the reference only. Physical deletes remove the DB record first, then attempt disk deletion (disk failure is logged but not fatal).

### API routes

| Method | Path | Module |
| -------- | ------ | -------- |
| GET | `/health` | Health check |
| GET | `/` | API info |
| POST | `/api/auth/register/start` | WebAuthn registration start (`{ setupToken? }`; credential count 0 = bootstrap phase needs SETUP_TOKEN, ≥1 = session required to add device; the `users` row must already exist via the bootstrap script) |
| POST | `/api/auth/register/finish` | Registration finish (validate attestation → create credential → auto-login cookie) |
| POST | `/api/auth/login/start` | WebAuthn login start (returns challenge + allowCredentials) |
| POST | `/api/auth/login/finish` | Login finish (validate signature + monotonic counter → session cookie) |
| POST | `/api/auth/logout` | Logout (clears the cookie) |
| GET | `/api/auth/me` | Auth state + user info (`{ authenticated, user }`) |
| GET, PATCH, DELETE | `/api/auth/credentials[/:id]` | Credential list / rename / delete (last credential delete → 409) |
| GET, PUT | `/api/users/me` | Profile read/update (name/email/birthday, session required) |
| POST, GET, DELETE | `/api/tokens[/:id]` | API token create (plaintext once) / list (prefix only) / revoke |
| GET | `/api/audit/logs` | Audit log list (session required) |
| GET | `/api/audit/logs/unread-count` | Unread audit log count |
| PUT | `/api/audit/logs/read` | Mark audit logs as read |
| GET, POST | `/api/moments` | Moment list / create (create accepts optional `attachments[]`) |
| GET, PUT, DELETE | `/api/moments/:id` | Moment detail / update / delete |
| POST, DELETE | `/api/moments/:id/attachments[/:attachmentId]` | Moment attachment create / delete |
| GET, POST | `/api/moments/:id/comments` | Moment comment list / create (body `{ content }`, ≤2000) |
| PUT, DELETE | `/api/moments/:id/comments/:commentId` | Moment comment update / delete |
| POST, PUT, DELETE | `/api/moments/:id/tags[/:tagId]` | Moment tag add / replace / remove |
| GET, POST | `/api/tags` | Tag list / create |
| GET, PUT, DELETE | `/api/tags/:id` | Tag detail / rename / delete |
| POST, DELETE | `/api/tags/:id/attach` · `/api/tags/:id/detach` | Tag attach / detach |
| POST | `/api/blobs/upload` | Blob upload (multipart, field: `file`) |
| POST | `/api/blobs/cleanup-orphans` | Delete disk files not referenced by blob rows |
| GET | `/api/blobs` | Blob list (`?mimeType=image/&page=&pageSize=`) |
| GET | `/api/blobs/:id` | Blob metadata |
| GET | `/api/blobs/:id/file` | Blob download/preview (`?download=1` forces attachment) |
| POST | `/api/blobs/:id/access-link` | Create a temporary signed access link |
| DELETE | `/api/blobs/:id` | Blob delete (DB + disk) |
| POST, GET | `/api/blobs/:id/attachments` | Create / list blob attachment references |
| DELETE | `/api/blob-attachments/:id` | Delete an attachment reference only |
| GET, POST | `/api/task-groups` | Task group list / create |
| GET, PUT, DELETE | `/api/task-groups/:id` | Task group detail / rename / delete |
| GET, POST | `/api/tasks` | Task list (`?groupId=&status=`) / create |
| GET, PUT, DELETE | `/api/tasks/:id` | Task detail / update (status syncs `completedAt`) / delete |
| GET, POST | `/api/events` | Event list (`?from=&to=` time window, **bare array**) / create |
| GET, PUT, DELETE | `/api/events/:id` | Event detail / partial update / delete |
| WS | `/api/ai/ws` | AI assistant (宁序) WebSocket chat: session CRUD + prompt/steer/followUp/abort, streaming events |

Field-naming gotchas: moment uses `text` (there is no `diary` module anymore — don't confuse it with the removed diary's `content`/`diaryDate`). Event uses `title`/`startAt`/`endAt`/`isAllDay`/`location`/`note`; its list is a time-window query returning a **bare array** (not `{ items, total }`).

User-facing messages are in Chinese.

### Authentication (Passkey + API tokens)

Standard **WebAuthn (Passkey)** auth with manageable API tokens for CLI/scripts (GitHub PAT mode). Single-user design (the deployer), multi-device via multiple passkey credentials. See `.ai/requirements/2026-08-09-passkey-auth.md`.

- **Browser (Web):** `navigator.credentials` ceremony against `/api/auth/register/*` and `/api/auth/login/*` → HttpOnly **HMAC-signed cookie** (`serenique_session`, stateless, signed with `SESSION_SECRET`, payload carries `userId`; no session table).
- **No public first registration.** The `users` row is created **only** by the bootstrap script `bun scripts/bootstrap-user.ts` (idempotent; `--name/--email/--birthday` args or `FIRST_USER_*` env; only needs `DATABASE_URL`). The frontend has no registration form — only a hidden `/setup?setupToken=` page for the first passkey.
- **Registration gate (credential-count based):** `passkey_credentials` count == 0 → `SETUP_TOKEN` constant-time compare required (bootstrap phase; the `users` row must already exist, else 500 with a script hint); count ≥ 1 → session required (the same endpoint adds a new device). Deleting the last credential → 409.
- **Login counter:** strict monotonic check (new counter > stored counter) — regression = clone suspicion, audited.
- **CLI / scripts / mobile:** `Authorization: Bearer <API token>` — tokens created via `POST /api/tokens` (plaintext shown once, only SHA-256 hash stored, `revoked_at` soft-revoke).
- **Challenges:** single-process in-memory Map, 5-minute TTL, one-time consume.
- **Audit logs:** 登录成功/失败、注册、token 创建/撤销、凭证删除 → `auditLogs`（`auth.*` / `token.*` 事件）。
- **env:** `SESSION_SECRET` (cookie signing), `SETUP_TOKEN` (bootstrap registration; removable after first registration), `FIRST_USER_NAME/FIRST_USER_EMAIL/FIRST_USER_BIRTHDAY` (bootstrap script), `WEBAUTHN_RP_ID` (RP ID = **front-end domain**, not the API domain; changing it invalidates all passkeys), `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS` (comma-separated ceremony origin allowlist).
- **Middleware allowlist:** `/health`, `/`, `/api/auth/register/start|finish`, `/api/auth/login/start|finish`, `/api/auth/logout`, signed blob file links (`/api/blobs/:id/file?expires=&signature=`). Ceremony endpoints still resolve session vars best-effort (add-device flow needs the logged-in userId).
- **Fail-closed:** production refuses to start without `SESSION_SECRET` + `WEBAUTHN_RP_ID`, and with auth enabled + empty `users` table (hint: run `bun scripts/bootstrap-user.ts` first); dev skips auth entirely when `WEBAUTHN_RP_ID` is unset (zero friction).
- **Rotating `SESSION_SECRET` invalidates all session cookies; revoking a token kills that Bearer immediately.**
- Session cookie defaults to 30 days (`SESSION_TTL`, in seconds). Production cross-origin setups (e.g. pages.dev → api.zeroicey.me) need `CORS_ORIGIN` explicitly set to the web domain — credentialed cross-origin forbids `*`.

### services/mcp (frozen)

**停更冻结（sunset — see `.ai/decisions/2026-08-08-mcp-sunset.md`）**: the code stays in the repo but is **not maintained, not built, not deployed, and not modified**. Never schedule requirements, fixes, or tool changes for `services/mcp`, and do not "keep it compiling" when the API surface changes — nothing consumes it anymore. "AI tool exposure" requirements go through the CLI (`apps/cli`) or the API service layer. (Historical context: it was a Bun + `@modelcontextprotocol/sdk` server calling the API service layer via `@serenique/api`.)

### CLI module (`apps/cli`)

Go + cobra CLI for the API (like `gh`). Dependency direction: `cmd/` (cobra commands) → `internal/{config,client,output}` — the three internal packages are independent of each other. Config lives at `~/.serenique/config.yaml`, with priority CLI flag > env (`SERENIQUE_BASEURL`/`SERENIQUE_TOKEN`) > file > default. `--json`/`-j` switches the `output.Printer` to machine-readable JSON.

Hard contracts from the 08-05 evaluation — do not regress these:

- **Errors exit non-zero.** Every `RunE` returns an error; never `return nil` on failure. `rootCmd` uses `SilenceUsage` + `SilenceErrors` and renders the error exactly once.
- **stdout purity.** Results (table, or a single JSON document under `--json`) → stdout; progress/confirmations/errors → stderr. Prefer `output.Printer`; don't `fmt.Printf` to stdout.
- **Token masking.** Any token output — including `--json` (the machine-consumable mode) — goes through `maskToken()`.
- **API contract source of truth** is the `services/api` workspace source, not a running container. moment's field is `text`; when backend fields change, sync the CLI struct's `json:"..."` tags.
- **Download path sanitization.** Default filenames must pass through `filepath.Base()`; never `os.Create(originalName)` directly (path traversal).
- **Transfers are cancellable and bounded.** Root context derived from `signal.NotifyContext(os.Interrupt, SIGTERM)`; transfer client sets `ResponseHeaderTimeout`. No `context.Background()` on transfer paths.
- **Config security.** File `0600`, dir `0700`, atomic temp+rename writes, symlink-safe chmod. New config fields must be threaded through `Resolve`, precedence, and the `config set` whitelist.
- **Confirmations.** Use `helpers.confirm()` — prompt to stderr, EOF in non-interactive stdin means "not confirmed" → error → exit non-zero.
- **CJK-safe truncation.** Use `truncateRunes()`, never byte-slice strings.
- **`List` is a generic free function**, not a method (Go forbids generic methods on non-generic receiver types).
- **Full verification** is `go build ./... && go vet ./... && go test -count=1 ./...` (`make test` runs `go test ./...`, which includes `cmd/`).

Adding a new module (e.g. drive): `internal/client/drive.go` (typed methods) → `cmd/drive.go` (cobra commands) → register in `cmd/root.go`. Nothing else needs touching.

## Release / publishing process

Versions come from git tags (`vX.Y.Z`) — the CLI's `--version` is injected from the tag (`git describe --tags` / `GITHUB_REF_NAME` in CI), so **tagging is a prerequisite for releasing**. Releases run entirely through GitHub Actions in two steps:

```sh
# 1. Commit and push main → docker-publish pushes zeroicey/serenique-api:main (MCP image no longer built — sunset)
git push origin main

# 2. Tag the version and push → triggers docker-publish (version tag + latest) and release-cli (GitHub Release) at the same time
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

- `.github/workflows/docker-publish.yml` — multi-arch (linux/amd64+arm64) build pushed to Docker Hub. tag `v*` → `{version}` / `v{version}` / `latest`; main push → `main`; `workflow_dispatch` supported. Requires GitHub secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (a Docker Hub access token, **unrelated to `gh`'s GitHub login`).
- `.github/workflows/release-cli.yml` — on tag `v*`, cloud-compiles for 5 platforms (matching the Makefile `build-all`) + `checksums.txt` + `gh release create --generate-notes`.
- Docker Hub namespace: `zeroicey` — `zeroicey/serenique-api` only (`serenique-mcp` is no longer built/pushed, see the MCP sunset decision).
- Images run as **non-root (UID 10001)**: fresh named volumes automatically inherit the in-image owner; existing volumes need a one-time chown to 10001 (`docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`), otherwise the container cannot write to `/data/blobs`.
- Full runbook: `.ai/runbooks/release-process.md` (Docker Hub secrets, UID 10001 chown, bun `--production` lockfile freeze pitfall); server deployment: `.ai/runbooks/hpcore-deploy.md`.

## Docker

The repo has no docker-compose file; images are built and run directly with the repo root as the build context:

```sh
docker build -t serenique-api -f services/api/Dockerfile .

docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://serenique:serenique@host:5432/serenique \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -e BLOB_SIGNING_SECRET=<32+ chars> \
  -e SESSION_SECRET=<32+ chars> \
  -e SETUP_TOKEN=<32+ chars> \
  -e WEBAUTHN_RP_ID=your-web-domain \
  -e WEBAUTHN_ORIGINS=https://your-web-domain \
  -e CORS_ORIGIN=https://your-web-domain \
  -e OPENCODE_API_KEY=<gateway key for the AI assistant> \
  -e AI_MODEL=opencode-go/deepseek-v4-flash \
  -v /host/path:/data/blobs \
  -v /host/sessions:/data/sessions \
  serenique-api
```

The `-e` env keys are documented in `.env.example`. `BLOB_ROOT` is fixed to `/data/blobs` inside the container and persisted through a host volume; `/data/sessions` holds the AI assistant's jsonl sessions (mount a volume in production). `DATABASE_URL` is required; the entrypoint (`scripts/docker-entrypoint.sh`) rewrites localhost database hosts to `host.docker.internal` for container access. `BLOB_SIGNING_SECRET` (≥32 chars) is required for the `blob link` / signed access-link feature. Passkey auth is optional in dev (skipped when `WEBAUTHN_RP_ID` is unset), required in production (fail-closed on missing `SESSION_SECRET` / `WEBAUTHN_RP_ID`). `SETUP_TOKEN` is only needed until the first registration completes. Before the first registration, the `users` row must exist — run `bun scripts/bootstrap-user.ts` (the image includes `services/api/scripts/`).

Default values in Dockerfiles: `NODE_ENV=production`, `BLOB_ROOT=/data/blobs`, `BLOB_MAX_SIZE=104857600` (100 MB), API `PORT=3000`, MCP `PORT=3001`, MCP `MCP_TRANSPORT=streamable-http`.
