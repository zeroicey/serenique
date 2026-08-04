# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Serenique is a personal journaling and note-taking API. It is a monorepo with services under `services/`. Currently the only service is `services/api`.

**Tech stack:** Bun runtime, Hono web framework, PostgreSQL via Drizzle ORM, Zod validation, Pino logging, TypeScript with strict mode.

## Commands

All commands run from `services/api/`:

```sh
bun install          # Install dependencies
bun run dev          # Start dev server with hot reload (port 3000)
bun run start        # Same as dev
bun run db:generate  # Generate Drizzle migrations from schema changes (requires TTY)
bun run db:migrate   # Apply pending migrations to the database
bun run db:push      # Push schema directly to DB (bypasses migrations, works in CI)
```

Environment variables are loaded from `services/api/.env` by Bun automatically in dev. Required variables for Docker are set in the Dockerfile.

## Architecture

```
services/api/src/
├── index.ts          — Entry point: validates env, initialises blob root, creates app
├── app.ts            — App factory: wires middleware, routes, error handler, 404
├── env.ts            — Zod-validated env (DATABASE_URL, BLOB_ROOT, BLOB_MAX_SIZE, PORT, NODE_ENV)
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
    ├── diary/        — Diary entries (one per day, dated)
    └── moment/       — Lightweight flash notes
```

### Module structure

Every module follows the same 5-file + barrel pattern:

| File | Purpose |
|------|---------|
| `*.schema.ts` | Drizzle table definition |
| `*.types.ts` | Zod validation schemas + TypeScript types for inputs/outputs |
| `*.service.ts` | Business logic, DB queries — throws `AppError` on failure |
| `*.handler.ts` | Parses request with Zod → calls service → builds `Res` response |
| `*.router.ts` | Hono router with RESTful routes, mounted under `/api` |
| `index.ts` | Barrel re-export of the router |

Each module is a self-contained Hono instance. Modules are wired in `app.ts` via `app.route("/api", moduleRouter)`.

### Key patterns

- **App factory:** The app is created by `createApp(env)` — env is parsed at import time in `index.ts` and crashes fast if invalid.
- **Startup init:** `index.ts` calls `initBlobRoot(env.BLOB_ROOT)` with a top-level await before creating the app. This validates the blob storage directory and creates it if missing.
- **Unified response shape:** All API responses use `{ success, code, message, data?, error? }`. Use the `Res` builder from `shared/response.ts` — never call `c.json()` directly in handlers.
- **Error handling:** Services throw `AppError`. Handlers catch and convert to responses. A global `onError` in `app.ts` catches anything unhandled and returns a 500.
- **Path alias:** `@/*` maps to `./src/*` (configured in `tsconfig.json`).
- **Database:** The single `db` export from `db/connection.ts` is used everywhere. Never create a second connection pool. The central `db/schema.ts` re-exports all table definitions — Drizzle Kit reads this file, so every new table must be exported there.
- **Env in services:** Services that need environment variables (like `blob.service.ts` needing `BLOB_ROOT` and `BLOB_MAX_SIZE`) import `env` directly from `@/env`. This is acceptable when the service is tightly coupled to the environment config.

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
| GET, POST | `/api/diaries` | Diary list / create |
| GET, PUT, DELETE | `/api/diaries/:id` | Diary detail / update / delete |
| GET, POST | `/api/moments` | Moment list / create |
| DELETE | `/api/moments/:id` | Moment delete |
| POST | `/api/blobs/upload` | Blob upload (multipart, field: `file`) |
| POST | `/api/blobs/cleanup-orphans` | Delete disk files not referenced by blob rows |
| GET | `/api/blobs` | Blob list (`?mimeType=image/&page=&pageSize=`) |
| GET | `/api/blobs/:id` | Blob metadata |
| GET | `/api/blobs/:id/file` | Blob download/preview (`?download=1` forces attachment) |
| POST | `/api/blobs/:id/access-link` | Create a temporary signed access link |
| DELETE | `/api/blobs/:id` | Blob delete (DB + disk) |
| POST, GET | `/api/blobs/:id/attachments` | Create / list blob attachment references |
| DELETE | `/api/blob-attachments/:id` | Delete an attachment reference only |

User-facing messages are in Chinese.

## Docker

```sh
docker build -t serenique-api services/api

docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://serenique:serenique@host:5432/serenique \
  -e BLOB_ROOT=/data/blobs \
  -e BLOB_MAX_SIZE=104857600 \
  -v /host/path:/data/blobs \
  serenique-api
```

Default values in Dockerfile: `PORT=3000`, `NODE_ENV=production`, `BLOB_ROOT=/data/blobs`, `BLOB_MAX_SIZE=104857600` (100 MB).
