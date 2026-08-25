# Serenique

**English** | [简体中文](README.zh-CN.md)

![CI - Docker Publish](https://github.com/zeroicey/serenique/actions/workflows/docker-publish.yml/badge.svg)
![CI - CLI Release](https://github.com/zeroicey/serenique/actions/workflows/release-cli.yml/badge.svg)
![Docker Image Version](https://img.shields.io/docker/v/zeroicey/serenique-api?sort=semver&label=docker)
![Docker Pulls](https://img.shields.io/docker/pulls/zeroicey/serenique-api)
![License](https://img.shields.io/github/license/zeroicey/serenique)

Self-hosted, privacy-first personal journaling and note-taking service. Capture flash notes, manage tasks and calendar events, store files — all secured with passkey (WebAuthn) authentication, and with a built-in AI assistant (宁序) that manages your day through conversation.

Designed for a single user, deployed anywhere (Docker, a VPS, or your own hardware), and driven from four surfaces: a React web app, a Go CLI (for humans *and* AI agents), an iOS/Android Flutter app, and the REST API itself.

## Features

- **Flash notes (Moments)** — short text notes (≤10,000 chars) with nested self-comments (≤2,000 chars), tags, file attachments, and location
- **Tasks** — custom task groups plus simple tasks with a status flow (`todo` / `done` / `abandon`); `completedAt` stays in sync with status automatically
- **Calendar events** — title, start/end, all-day, location, note; time-window queries return a bare array for easy consumption
- **File storage (blob)** — any MIME type, SHA-256 content deduplication, image dimension extraction (JPEG/PNG/GIF/WebP), single-`Range` downloads, and HMAC-signed temporary access links
- **AI assistant 宁序** — WebSocket chat where the agent calls the API service layer directly (task/event/moment CRUD via `defineTool`); streaming markdown, visible thinking, tool-call cards, session switching — zero confirmation prompts, just do
- **Security** — passkey (WebAuthn) login, GitHub-PAT-style API tokens for CLI/scripts, stateless HMAC-signed session cookies, credential counter audit, fail-closed production startup
- **Audit log** — every auth and token event recorded, with retention sweep and unread tracking
- **Multi-client** — web (React), CLI (Go), mobile (Flutter), and REST API, sharing one service layer

## Repository structure

```
serenique/
├── services/
│   ├── api/            # REST API — Bun + Hono + Drizzle + PostgreSQL (source of truth)
│   └── mcp/            # legacy MCP server — frozen, not maintained
├── apps/
│   ├── cli/            # Go CLI client (cobra, gh-style) for humans and AI agents
│   ├── web/            # React web client
│   └── mobile/         # Flutter app (iOS/Android)
├── scripts/            # docker-entrypoint.sh (DB host rewrite for containers)
├── .github/workflows/  # CI/CD — Docker image publish + CLI cross-platform releases
└── .env.example        # documented environment variables for all services
```

## Tech stack

| Layer | Technology |
|-------|------------|
| API | Bun, Hono, Drizzle ORM, PostgreSQL, Zod, Pino, `@simplewebauthn/server`, PI agent SDK (`@earendil-works/pi-coding-agent`) |
| Web | React 19, Vite, shadcn/ui, TanStack Query, zustand, react-router, streamdown |
| CLI | Go 1.26+, cobra, yaml.v3 |
| Mobile | Flutter (Material 3), dio, Riverpod 3, go_router, flutter_secure_storage |
| Infra | Docker (multi-arch amd64/arm64), GitHub Actions, Docker Hub |

## Getting started (local development)

Prerequisites: [Bun](https://bun.sh), [Go](https://go.dev/dl/) 1.26+ (CLI only), [PostgreSQL](https://www.postgresql.org/) (or any local Postgres, e.g. via Docker), [Flutter](https://flutter.dev) (mobile only).

### 1. Run the API

```sh
cd services/api
bun install
cp ../../.env.example .env   # edit DATABASE_URL and any other settings
bun run db:push              # create tables (or bun run db:migrate)
bun run dev                  # http://localhost:3000
```

> Local dev skips authentication entirely when `WEBAUTHN_RP_ID` is unset — zero friction for getting started. Set `WEBAUTHN_RP_ID` when you want the real passkey flow.

### 2. Run the web client

```sh
cd apps/web
bun install
bun run dev                  # http://localhost:5173 (proxies /api → :3000)
```

### 3. Try the CLI

```sh
cd apps/cli
make build
./bin/serenique init         # point it at your API and set an API token
./bin/serenique moment create -m "hello serenique"
```

## Self-hosting with Docker

```sh
docker run -d --name serenique -p 3000:3000 \
  -e DATABASE_URL=postgresql://serenique:serenique@host:5432/serenique \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -e BLOB_SIGNING_SECRET=<32+ chars> \
  -e SESSION_SECRET=<32+ chars> \
  -e SETUP_TOKEN=<32+ chars> \
  -e WEBAUTHN_RP_ID=your-web-domain \
  -e WEBAUTHN_ORIGINS=https://your-web-domain \
  -e CORS_ORIGIN=https://your-web-domain \
  -e AI_API_KEY=<key> \
  -e AI_BASE_URL=http://hpcore.hpnet.internal:3005/v1 \
  -v serenique-blobs:/data/blobs \
  -v serenique-ai-config:/data/ai \
  -v serenique-sessions:/data/sessions \
  zeroicey/serenique-api:latest
```

Then create the user row and register your first passkey:

```sh
docker exec -it serenique bun scripts/bootstrap-user.ts   # creates the users row (idempotent)
# open https://your-web-domain/setup?setupToken=<SETUP_TOKEN> to register the first passkey
# SETUP_TOKEN can be removed from the env afterwards
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (**required**) |
| `BLOB_ROOT` | Blob storage root — fixed at `/data/blobs` in the container |
| `BLOB_MAX_SIZE` | Max upload size in bytes (default 100 MB) |
| `BLOB_SIGNING_SECRET` | HMAC secret (≥32 chars) for signed blob access links |
| `SESSION_SECRET` | Cookie-signing secret (≥32 chars). **Required in production** (fail-closed); rotating it invalidates all sessions |
| `SETUP_TOKEN` | Bootstrap registration token (≥32 chars); removable after the first passkey is registered |
| `WEBAUTHN_RP_ID` | Frontend domain (not the API domain). Changing it invalidates all registered passkeys. Unset = auth skipped (dev only) |
| `WEBAUTHN_ORIGINS` | Comma-separated WebAuthn ceremony origin allowlist |
| `CORS_ORIGIN` | Web frontend origin, required for credentialed cross-origin requests |
| `AI_API_KEY` | AI assistant credentials (NewAPI gateway) |
| `AI_BASE_URL` | OpenAI-compatible endpoint (default `http://hpcore.hpnet.internal:3005/v1`) |
| `AI_MODEL` | Model override (default `newapi/ox-alpha`); generated catalog contains exactly this model |
| `AI_CONTEXT_WINDOW` / `AI_MAX_TOKENS` | Optional context-window / max-output-token overrides (defaults 1048576 / 131072) |
| `AI_SESSION_DIR` | AI session directory (default `/data/sessions` in production) |
| `FIRST_USER_NAME` / `FIRST_USER_EMAIL` / `FIRST_USER_BIRTHDAY` | Defaults for the bootstrap user script |
| `AUDIT_RETENTION_DAYS` / `AUDIT_MAX_ROWS` | Audit log retention (default 90 days / 5,000 rows) |
| `SESSION_TTL` | Session cookie lifetime in seconds (default 30 days) |
| `PORT` | API port (default 3000) |

Notes:

- The image runs as **non-root (UID 10001)**. Fresh named volumes inherit ownership automatically; pre-existing volumes need a one-time `docker run --rm -v <vol>:/data alpine chown -R 10001:10001 /data`.
- The entrypoint rewrites a `localhost` database host to `host.docker.internal` so the container can reach Postgres on the host machine.
- Secrets never enter images — everything is passed via `docker run -e`.

## CLI overview

`serenique` is a `gh`-style command-line client that covers the whole API — ideal for scripts and AI agents (`--json` output, non-zero exit codes, token-masking, safe downloads). Commands: `init`, `config`, `auth`, `token`, `moment`, `task`, `blob`, `logs`, `tag`. Full reference: [apps/cli/README.md](apps/cli/README.md).

## Documentation

- [CLI reference](apps/cli/README.md) — every command with examples, config precedence, AI-agent usage patterns
- [Mobile app](apps/mobile/README.md) — Flutter app setup, modules, device install notes
- [Environment reference](.env.example) — all environment variables for API, web, and AI assistant

## License

[MIT](LICENSE) © 2026 zeroicey
