# AGENTS.md

Serenique is a personal journaling and note-taking service. This file provides guidance for opencode when working in this repository.

## Project overview

Monorepo with two kinds of packages:

- `services/` — server-side processes:
  - `services/api` — REST API (Bun + Hono + Drizzle + PostgreSQL)
  - `services/mcp` — MCP server exposing the API's service layer to AI agents
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
|------|------|
| 解决新问题 / 踩坑 | 写 worklog（remember-worklog skill） |
| 完成珍贵/难的需求或流程 | 写 worklog + 可复现则写 runbook（remember-runbook skill） |
| 与用户讨论需求 | 边讨论边写 requirements（remember-requirement skill） |
| 做出决策 | 写 decisions（remember-decision skill） |

技能定义在 `.opencode/skills/remember-*`；memory 插件自动把会话片段写进 `.ai/inbox/`，由 memory-consolidate 整理。标准流程只放 `.ai/runbooks/`，worklog 不重复收录。

## AI agent team (multi-agent collaboration)

Serenique uses a "captain + domain-expert agent" collaboration model: the **main session (opencode build agent) is the captain**, responsible for decomposing requirements, dispatching work, acceptance, and integration; domain experts are `.opencode/agents/*.md` subagents (`mode: subagent`), dispatched on demand and possibly in parallel.

| Agent | File | Domain |
|-------|------|--------|
| API Agent | `.opencode/agents/api-agent.md` | `services/api`: REST, data models, service layer, tests, `exports.ts` |
| MCP Agent | `.opencode/agents/mcp-agent.md` | `services/mcp`: AI tool exposure, streamable-http |
| CLI Agent | `.opencode/agents/cli-agent.md` | `apps/cli`: Go CLI client |
| Web Agent | `.opencode/agents/web-agent.md` | `apps/web`: React browser client |
| Deploy Agent | `.opencode/agents/deploy-agent.md` | Docker, GitHub Actions, releases, servers |
| Flutter Agent | `.opencode/agents/flutter-agent.md` | Flutter mobile (iOS/Android, planned) |

Dispatch rules: a single requirement often touches multiple subsystems (e.g. "adding a drive module" affects API + MCP + CLI + Web). The captain first decomposes the affected subsystems, then **dispatches agents in parallel** (multiple Task tool calls in one message = parallel), each developing in its own domain; the captain owns cross-client contract alignment (with the `services/api` source as the source of truth: field names, response shapes, `exports.ts` export surface) and final acceptance. Manual invocation is possible via `@agent-name` in the conversation.

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
services/mcp/         MCP server exposing the API service layer via streamable-http
scripts/              docker-entrypoint.sh (rewrites localhost DB host to host.docker.internal)
.ai/                  Project memory: worklog/ architecture/ decisions/ requirements/ runbooks/ archive/ inbox/
```

### services/api

```
services/api/src/
├── index.ts          — Entry point: validates env, initializes blob root, creates app
├── app.ts            — App factory: wires middleware, routes, error handling, 404
├── env.ts            — Zod-validated env (DATABASE_URL, BLOB_ROOT, BLOB_MAX_SIZE, BLOB_SIGNING_SECRET, AUTH_TOKEN, SESSION_TTL, PORT, NODE_ENV)
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
    ├── diary/        — Diaries (one per day, by date; fields: content, diaryDate)
    ├── moment/       — Flash notes (≤10000 chars; field: text; media attachments via blob refs; `comment.*` nested self-comments, ≤2000 chars)
    ├── task/         — Task groups (custom) + simple tasks (fields: groupId/title/status; completedAt synced with status)
    └── event/        — Calendar events (fields: title/startAt/endAt/isAllDay/location/note; time-window list, bare array)
```

### Module structure

Every module has a fixed file set (core skeleton):

| File | Responsibility |
|------|----------------|
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
- **Workspace exports:** `src/exports.ts` is the `@serenique/api` package entry point — re-exports the service layer, Zod schemas, and shared utilities (no handler/router/middleware). MCP consumes the API through it (`import { ... } from "@serenique/api"`). Keep the export surface small and typed; external consumers share the same DB connection

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
|--------|------|--------|
| GET | `/health` | Health check |
| GET | `/` | API info |
| POST | `/api/auth/login` | Auth login (token exchanged for an HttpOnly session cookie) |
| POST | `/api/auth/logout` | Logout (clears the cookie) |
| GET | `/api/auth/me` | Session status check |
| GET, POST | `/api/diaries` | List / create diaries |
| GET | `/api/diaries/by-date/:date` | Get diary by date (404 if none; registered before `:id`) |
| GET, PUT, DELETE | `/api/diaries/:id` | Diary detail / update / delete |
| GET, POST | `/api/moments` | List / create moments (creation may include optional `attachments[]`) |
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

Field naming pitfall: diary uses `content`/`diaryDate`, but moment uses `text` — don't mix them up. The CLI contract (and MCP) follows the API source: the moment body is `{ "text": ... }`. event uses `title`/`startAt`/`endAt`/`isAllDay`/`location`/`note`; its list returns a **bare array** for time-window queries (not `{ items, total }`).

User-visible messages must be in Chinese.

### Authentication (Auth)

Single shared-secret authentication: all clients use the high-entropy `AUTH_TOKEN` from the root `.env` (≥32 chars, 48+ recommended). **In production, the API refuses to start if it's missing** (fail closed); in dev, authentication is skipped entirely when unconfigured (zero friction locally).

- **CLI / mobile / scripts:** `Authorization: Bearer <AUTH_TOKEN>` request header
- **Web (browser):** `/login` form submits `{ token }` → exchanged for an **HttpOnly signed cookie** (`serenique_session`, stateless HMAC signature, no session table); requests use `credentials:"include"`
- **Middleware allowlist:** `/health`, `/`, `/api/auth/login`, `/api/auth/logout`, signed blob file links (`/api/blobs/:id/file?expires=&signature=`)
- **Key rotation = all clients invalidated:** after changing `.env` and restarting, old session cookies and old Bearer tokens all become invalid; there is no session table to clear
- Session cookies default to 30 days (`SESSION_TTL`, in seconds). Production cross-origin setups (e.g. pages.dev → api.zeroicey.me) need `CORS_ORIGIN` explicitly set to the web domain — credentialed cross-origin requests do not allow `*`

### services/mcp

A Bun + `@modelcontextprotocol/sdk` server that exposes diary/moment/blob operations to AI agents via **streamable-http** at `/mcp` (port 3001). It calls the API service layer directly through the `@serenique/api` workspace package (same DB), without going over HTTP. Tools are defined in `src/tools/*.tools.ts` and registered in `src/server.ts`.

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
# 1. Commit and push main → docker-publish pushes zeroicey/serenique-{api,mcp}:main
git push origin main

# 2. Tag a version and push → triggers both docker-publish (version tag + latest) and release-cli (GitHub Release)
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

- `.github/workflows/docker-publish.yml` — multi-arch (linux/amd64+arm64) builds pushed to Docker Hub. Tag `v*` → `{version}` / `v{version}` / `latest`; main push → `main`; supports `workflow_dispatch`. Requires GitHub secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (a Docker Hub access token, **unrelated to `gh`'s GitHub login**)
- `.github/workflows/release-cli.yml` — on tag `v*`, cloud-compiles 5 platforms (matching Makefile `build-all`) + `checksums.txt` + `gh release create --generate-notes`
- Docker Hub namespace: `zeroicey` (`zeroicey/serenique-api`, `zeroicey/serenique-mcp`)
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
  -e AUTH_TOKEN=<32+ chars> \
  -e CORS_ORIGIN=https://your-web-domain \
  -v /host/path:/data/blobs \
  serenique-api
```

The `-e` env keys are documented in `.env.example`. `BLOB_ROOT` is fixed at `/data/blobs` inside the container, persisted via a host volume. `DATABASE_URL` is required; the entrypoint (`scripts/docker-entrypoint.sh`) rewrites the localhost database host to `host.docker.internal` for container access. `BLOB_SIGNING_SECRET` (≥32 chars) is required for the `blob link` / signed access link feature. Auth is optional in dev (skipped when `AUTH_TOKEN` is unset), required in production (fail closed).

Dockerfile defaults: `NODE_ENV=production`, `BLOB_ROOT=/data/blobs`, `BLOB_MAX_SIZE=104857600` (100 MB), API `PORT=3000`, MCP `PORT=3001`, MCP `MCP_TRANSPORT=streamable-http`.
