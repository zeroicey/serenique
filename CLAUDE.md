# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Serenique is a personal journaling and note-taking API. It is a monorepo with two kinds of packages:

- `services/` — server-side processes:
  - `services/api` — the REST API (Bun + Hono + Drizzle + PostgreSQL)
  - `services/mcp` — an MCP server exposing the API's service layer to AI agents (**frozen — do not modify or schedule work on it**, see `.ai/decisions/2026-08-08-mcp-sunset.md`)
- `apps/` — client-side applications:
  - `apps/cli` — a Go CLI client (cobra), modeled after GitHub's `gh`, for humans and AI agents

**API stack:** Bun runtime, Hono web framework, PostgreSQL via Drizzle ORM, Zod validation, Pino logging, TypeScript with strict mode.
**CLI stack:** Go (1.26+), cobra, yaml.v3.

Before starting work on a subsystem, read the project memory in `.ai/` (below).

## Project memory (`.ai/`)

`.ai/` at the repo root is the project's memory — treat it as documentation of record. It holds:

- `worklog/` — dated work logs: what was built, evaluated, and fixed each day, plus explicit pitfalls ("tips for the next session").
- `architecture/` — architecture design docs. Later docs supersede earlier ones (e.g. `2026-08-05-cli-tool-architecture-updates.md` explicitly marks itself as the finalized CLI architecture over the 08-04 design).
- `decisions/` — decision records with **Why** / **How to apply** rationale, including rejected/deferred options.

Read the latest relevant docs before changing a subsystem. The CLI's evaluation history and hardening contracts live in the 08-05 worklog/architecture/decisions files and are condensed into the CLI section below.

## AI agent team (multi-agent collaboration)

Serenique uses a "captain + domain-expert agents" collaboration model: **the main session (Claude Code) is the captain**, responsible for breaking down requirements, dispatching work, acceptance, and integration. Domain experts exist as subagents in `.claude/agents/*.md`, dispatched on demand and able to run in parallel.

| Agent | File | Domain |
|-------|------|--------|
| API Agent | `.claude/agents/api-agent.md` | `services/api`: REST, data models, service layer, tests, `exports.ts` |
| MCP Agent (disabled) | `.claude/agents/mcp-agent.md` | `services/mcp` — frozen (MCP sunset 08-08); **do not dispatch** |
| CLI Agent | `.claude/agents/cli-agent.md` | `apps/cli`: Go command-line client |
| Web Agent | `.claude/agents/web-agent.md` | `apps/web`: React browser app |
| Deploy Agent | `.claude/agents/deploy-agent.md` | Docker, GitHub Actions, releases, servers |
| Flutter Agent | `.claude/agents/flutter-agent.md` | Mobile Flutter (iOS/Android, planned) |

Dispatching rule: a requirement often touches multiple subsystems at once (e.g. "adding a drive module" involves API + CLI + Web). **`services/mcp` is frozen (sunset 2026-08-08) and is never an affected subsystem** — "AI tool exposure" requirements go through the CLI or the API service layer instead. The captain first breaks down which subsystems are affected, then **dispatches the relevant agents in parallel**, each developing within its own domain; the captain owns cross-client contract alignment (with the `services/api` source as the source of truth: field names, response shapes, the `exports.ts` export surface) and final acceptance.

All agents have the same permissions as the captain (omitting the `tools` field = inheriting all tools), the tech stacks are constrained to each client's current stack, and using the project memory is mandatory (read `.ai/` before starting work, write to the worklog after finishing). Team charter: `.claude/agents/README.md`; decision record: `.ai/decisions/2026-08-06-ai-agent-team.md`.

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

Network note: pulling Go modules requires the China mirror `GOPROXY=https://goproxy.cn,direct` (`proxy.golang.org` is unreachable on this network).

Docker build network note: the build container cannot reach `registry.npmjs.org` directly — `docker build` fails at `bun install` with `ConnectionRefused` on every tarball. Rebuild with the host proxy injected as build args (Docker's predefined proxy args, no Dockerfile change):

```sh
docker build --build-arg http_proxy=http://host.docker.internal:7897 \
  --build-arg https_proxy=http://host.docker.internal:7897 \
  --build-arg no_proxy=localhost,127.0.0.1 \
  -t serenique-api -f services/api/Dockerfile .
```

`host.docker.internal:7897` is the host's local HTTP proxy (see the `http_proxy` env on this machine); adjust the port if it changes. Running an already-built image (`docker run`) does not need it — only rebuilds. The Dockerfile itself stays registry-agnostic so it builds on any network.

The runtime environment is passed via `docker run -e` flags (expected keys in `.env.example`). Service-local `.env` files are not used. Keep secrets out of images; root `.dockerignore` excludes `.env` files from the build context.

## Architecture

### Monorepo layout

```
apps/cli/             Go CLI client (cobra) — see "CLI module" below
services/api/         REST API — Bun + Hono + Drizzle + PostgreSQL
services/mcp/         MCP server exposing API service layer over streamable-http (frozen — see sunset decision)
scripts/              docker-entrypoint.sh (rewrites localhost DB host to host.docker.internal)
.ai/                  Project memory: worklog/ architecture/ decisions/
```

### services/api

```
services/api/src/
├── index.ts          — Entry point: validates env, initialises blob root, creates app
├── app.ts            — App factory: wires middleware, routes, error handler, 404
├── env.ts            — Zod-validated env (DATABASE_URL, BLOB_ROOT, BLOB_MAX_SIZE, BLOB_SIGNING_SECRET, AUTH_TOKEN, SESSION_TTL, PORT, NODE_ENV)
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
    ├── blob/         — Generic binary storage layer (all MIME types, SHA-256 dedup)
    ├── diary/        — Diary entries (one per day, dated; fields: content, diaryDate)
    ├── moment/       — Flash notes (≤10000 chars; field: text; media attachments via blob refs; nested self-comments in `comment.*`, ≤2000 chars)
    ├── task/         — Task groups (custom) + simple tasks (fields: groupId/title/status; completedAt synced by status)
    └── event/        — Calendar events (fields: title/startAt/endAt/isAllDay/location/note; time-range list, bare array)
```

### Module structure

Every module follows the same file set (core skeleton):

| File | Purpose |
|------|---------|
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

The blob module is intended as a **shared storage layer** for other modules (diary, moment, and future modules like drive/netdisk). It has no business-level constraints on file types — any MIME type is accepted.

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
|--------|------|--------|
| GET | `/health` | Health check |
| GET | `/` | API info |
| POST | `/api/auth/login` | Authenticate (exchange the secret for an HttpOnly session cookie) |
| POST | `/api/auth/logout` | Logout (clears the cookie) |
| GET | `/api/auth/me` | Query login state |
| GET, POST | `/api/diaries` | Diary list / create |
| GET | `/api/diaries/by-date/:date` | Diary by date (404 if none; registered before `:id`) |
| GET, PUT, DELETE | `/api/diaries/:id` | Diary detail / update / delete |
| GET, POST | `/api/moments` | Moment list / create (create accepts optional `attachments[]`) |
| GET, PUT, DELETE | `/api/moments/:id` | Moment detail / update / delete |
| POST, DELETE | `/api/moments/:id/attachments[/:attachmentId]` | Moment attachment create / delete |
| GET, POST | `/api/moments/:id/comments` | Moment comment list / create (body `{ content }`, ≤2000) |
| PUT, DELETE | `/api/moments/:id/comments/:commentId` | Moment comment update / delete |
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

Field-naming gotcha: diary uses `content`/`diaryDate`, but moment uses `text`. Don't confuse them — the CLI contract follows the API source: moment body is `{ "text": ... }`. Event uses `title`/`startAt`/`endAt`/`isAllDay`/`location`/`note`; its list is a time-window query returning a **bare array** (not `{ items, total }`).

User-facing messages are in Chinese.

### Authentication (Auth)

Single shared-secret authentication: all clients share the high-entropy `AUTH_TOKEN` from the root `.env` (≥32 chars, 48+ recommended). **If missing in production, the API refuses to start** (fail closed); when unset in dev, authentication is skipped entirely (zero friction locally).

- **CLI / mobile / scripts:** send the request header `Authorization: Bearer <AUTH_TOKEN>`.
- **Web (browser):** the `/login` form posts `{ token }` → exchanged for an **HttpOnly signed cookie** (`serenique_session`, stateless HMAC signature, no session table); requests use `credentials:"include"`.
- **Middleware allowlist:** `/health`, `/`, `/api/auth/login`, `/api/auth/logout`, signed blob file links (`/api/blobs/:id/file?expires=&signature=`).
- **Rotating the secret invalidates everything:** after changing `.env` and restarting, old session cookies and old Bearer tokens all stop working — there is no session table to clear.
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

- `.github/workflows/docker-publish.yml` — multi-arch (linux/amd64+arm64) build pushed to Docker Hub. tag `v*` → `{version}` / `v{version}` / `latest`; main push → `main`; `workflow_dispatch` supported. Requires GitHub secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (a Docker Hub access token, **unrelated to `gh`'s GitHub login**).
- `.github/workflows/release-cli.yml` — on tag `v*`, cloud-compiles for 5 platforms (matching the Makefile `build-all`) + `checksums.txt` + `gh release create --generate-notes`.
- Docker Hub namespace: `zeroicey` — `zeroicey/serenique-api` only (`serenique-mcp` is no longer built/pushed, see the MCP sunset decision).
- Images run as **non-root (UID 10001)**: fresh named volumes automatically inherit the in-image owner; existing volumes need a one-time chown to 10001 (`docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`), otherwise the container cannot write to `/data/blobs`.
- Key pitfalls (bun `--production` implicitly freezing the lockfile, `--filter` being incompatible with `--frozen-lockfile`, the metadata-action `enable` expression syntax) are detailed in `.ai/worklog/2026-08-05-release-pipeline.md`.

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

The `-e` env keys are documented in `.env.example`. `BLOB_ROOT` is fixed to `/data/blobs` inside the container and persisted through a host volume. `DATABASE_URL` is required; the entrypoint (`scripts/docker-entrypoint.sh`) rewrites localhost database hosts to `host.docker.internal` for container access. `BLOB_SIGNING_SECRET` (≥32 chars) is required for the `blob link` / signed access-link feature. Auth is optional in dev (skipped when `AUTH_TOKEN` is unset), required in production (fail closed).

Default values in Dockerfiles: `NODE_ENV=production`, `BLOB_ROOT=/data/blobs`, `BLOB_MAX_SIZE=104857600` (100 MB), API `PORT=3000`, MCP `PORT=3001`, MCP `MCP_TRANSPORT=streamable-http`.
