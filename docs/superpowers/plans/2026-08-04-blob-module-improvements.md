# Blob Module Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current local blob module from a simple upload/download layer into a safer reusable storage foundation with migrations, hidden internals, reference-aware lifecycle, consistency cleanup, streaming, signed access links, and less brittle blob-root initialization.

**Architecture:** Keep the existing Hono handler, service, Drizzle schema, and `shared/storage.ts` boundaries. Add the least necessary public API surface while preserving the low-level blob abstraction and separating physical blob records from business attachment references.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle ORM, PostgreSQL migrations, local filesystem storage, Bun test.

---

### Task 1: Add Missing Blob Migration

**Files:**
- Create: `services/api/drizzle/0003_add_blobs.sql`
- Modify: `services/api/drizzle/meta/_journal.json`
- Create or modify: `services/api/drizzle/meta/0003_snapshot.json`

- [ ] **Step 1: Generate or write migration**

Run:

```bash
bun run --cwd services/api db:generate
```

Expected: a new migration creates `blobs` with `id`, `original_name`, `storage_path`, `mime_type`, `size`, `checksum`, `metadata`, `width`, `height`, `duration`, and `created_at`.

- [ ] **Step 2: Verify migration content**

Run:

```bash
rg -n '"blobs"|storage_path|checksum' services/api/drizzle
```

Expected: `CREATE TABLE "blobs"` and a unique constraint or unique index for `checksum`.

- [ ] **Step 3: Run checks**

Run:

```bash
bun run typecheck
bun test
```

Expected: typecheck exits 0 and all tests pass.

- [ ] **Step 4: Commit**

```bash
git add services/api/drizzle
git commit -m "feat(api): add blob table migration"
```

### Task 2: Hide Storage Path From Public Blob Responses

**Files:**
- Modify: `services/api/src/modules/blob/blob.types.ts`
- Modify: `services/api/src/modules/blob/blob.service.ts`
- Create: `services/api/src/modules/blob/blob.service.test.ts`
- Modify if needed: `services/mcp/src/tools/blob.tools.ts`

- [ ] **Step 1: Write failing test**

Add a test that passes a fake blob row through the public mapper and asserts `storagePath` is not present while internal storage reads can still use the stored path.

- [ ] **Step 2: Run test to verify red**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
```

Expected: fails because `storagePath` is still present.

- [ ] **Step 3: Implement public/internal split**

Export `toPublicBlobEntry(row)` and update `BlobEntry` to omit `storagePath`. Keep storage path only inside service internals.

- [ ] **Step 4: Run checks**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/blob services/mcp/src/tools/blob.tools.ts
git commit -m "fix(api): hide blob storage paths from responses"
```

### Task 3: Add Attachment References And Reference-Aware Deletion

**Files:**
- Modify: `services/api/src/modules/blob/blob.schema.ts`
- Modify: `services/api/src/db/schema.ts`
- Modify: `services/api/src/modules/blob/blob.types.ts`
- Modify: `services/api/src/modules/blob/blob.service.ts`
- Create: `services/api/drizzle/0004_add_blob_attachments.sql`
- Create or modify: `services/api/drizzle/meta/0004_snapshot.json`
- Modify: `services/api/drizzle/meta/_journal.json`
- Create or modify: `services/api/src/modules/blob/blob.service.test.ts`

- [ ] **Step 1: Write failing reference lifecycle tests**

Tests should prove a blob with references cannot be physically deleted by default, deleting an attachment only removes the reference, and physical deletion succeeds after no references remain.

- [ ] **Step 2: Run test to verify red**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
```

Expected: fails because attachments do not exist.

- [ ] **Step 3: Add attachment schema and service APIs**

Add `blob_attachments` with `id`, `blob_id`, `owner_type`, `owner_id`, `role`, `display_name`, `sort_order`, `metadata`, `created_at`, `updated_at`. Add service methods for creating, listing, deleting references, and make `delete(id)` refuse when references exist.

- [ ] **Step 4: Add migration**

Run:

```bash
bun run --cwd services/api db:generate
```

Expected: migration creates `blob_attachments` and indexes on `blob_id` and owner fields.

- [ ] **Step 5: Run checks**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/blob services/api/src/db/schema.ts services/api/drizzle
git commit -m "feat(api): add blob attachment references"
```

### Task 4: Add Upload Cleanup And Orphan Cleanup Tools

**Files:**
- Modify: `services/api/src/modules/blob/blob.service.ts`
- Modify: `services/api/src/shared/storage.ts`
- Create or modify: `services/api/src/modules/blob/blob.service.test.ts`
- Create if useful: `services/api/src/shared/storage.test.ts`

- [ ] **Step 1: Write failing consistency tests**

Tests should prove an insert failure removes the just-written file and a duplicate checksum conflict cleans up the redundant file before returning the existing blob.

- [ ] **Step 2: Run test to verify red**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
```

Expected: fails because cleanup helpers are not implemented.

- [ ] **Step 3: Implement cleanup**

Wrap insert in conflict-aware error handling. Delete the just-written file if DB insert fails. Add an orphan scan helper that compares disk-relative paths with DB rows and deletes unreferenced disk files under managed directories.

- [ ] **Step 4: Run checks**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts services/api/src/shared/storage.test.ts
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/blob services/api/src/shared
git commit -m "fix(api): clean up inconsistent blob files"
```

### Task 5: Stream Blob File Transfer

**Files:**
- Modify: `services/api/src/shared/storage.ts`
- Modify: `services/api/src/modules/blob/blob.service.ts`
- Modify: `services/api/src/modules/blob/blob.handler.ts`
- Create or modify: `services/api/src/modules/blob/blob.service.test.ts`

- [ ] **Step 1: Write failing stream contract test**

Test that the service returns file metadata plus a `Blob` or stream-compatible file body instead of a fully materialized `Buffer` for handler responses.

- [ ] **Step 2: Run test to verify red**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
```

Expected: fails because `getFile` returns `buf`.

- [ ] **Step 3: Implement streaming response**

Return a filesystem-backed `Blob` or stream-compatible body from storage helpers, set `Content-Length` from metadata, and preserve `Content-Type`, `Content-Disposition`, and cache headers.

- [ ] **Step 4: Run checks**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/blob services/api/src/shared/storage.ts
git commit -m "perf(api): stream blob file responses"
```

### Task 6: Add Signed Access Links

**Files:**
- Modify: `services/api/src/env.ts`
- Modify: `services/api/src/modules/blob/blob.types.ts`
- Modify: `services/api/src/modules/blob/blob.service.ts`
- Modify: `services/api/src/modules/blob/blob.handler.ts`
- Modify: `services/api/src/modules/blob/blob.router.ts`
- Create or modify: `services/api/src/modules/blob/blob.service.test.ts`

- [ ] **Step 1: Write failing signed link tests**

Tests should prove signed URLs include expiry and signature, valid signatures authorize file access, expired signatures fail, and tampered IDs fail.

- [ ] **Step 2: Run test to verify red**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
```

Expected: fails because signed link methods do not exist.

- [ ] **Step 3: Implement HMAC signed links**

Add `BLOB_SIGNING_SECRET`, create `POST /api/blobs/:id/access-link`, and allow `GET /api/blobs/:id/file?expires=&signature=` to validate signed access when regular API auth is absent in the future.

- [ ] **Step 4: Run checks**

Run:

```bash
bun test services/api/src/modules/blob/blob.service.test.ts
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/env.ts services/api/src/modules/blob
git commit -m "feat(api): add signed blob access links"
```

### Task 7: Make Blob Root Initialization Less Brittle

**Files:**
- Modify: `services/api/src/shared/storage.ts`
- Create or modify: `services/api/src/shared/storage.test.ts`
- Modify if needed: `CLAUDE.md`

- [ ] **Step 1: Write failing root initialization test**

Test that `initBlobRoot` tolerates `.DS_Store` or other top-level files and still ensures the managed object directory exists.

- [ ] **Step 2: Run test to verify red**

Run:

```bash
bun test services/api/src/shared/storage.test.ts
```

Expected: fails because `initBlobRoot` rejects top-level files.

- [ ] **Step 3: Implement managed object directory**

Use `objects` as the managed subdirectory beneath `BLOB_ROOT`. Build, read, write, delete, and scan paths under that subdirectory while leaving unrelated top-level files alone.

- [ ] **Step 4: Run checks**

Run:

```bash
bun test services/api/src/shared/storage.test.ts
bun run typecheck
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/shared/storage.ts services/api/src/shared/storage.test.ts CLAUDE.md
git commit -m "fix(api): tolerate local files in blob root"
```

### Final Audit

- [ ] Run:

```bash
git log --oneline -8
git status --short
bun run typecheck
bun test
```

Expected: recent commits include the plan and one commit for each of the seven points, worktree is clean, and checks pass.
