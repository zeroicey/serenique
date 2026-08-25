import { randomUUID } from 'node:crypto'
import type { blobs } from '@/modules/blob/blob.schema'
import type { events } from '@/modules/event/event.schema'
import type { moments } from '@/modules/moment/moment.schema'
import type { tagRelations, tags } from '@/modules/tag/tag.schema'
import type { taskGroups, tasks } from '@/modules/task/task.schema'

// ---------------------------------------------------------------------------
// Shared test helpers — single source of truth for env setup, DB gating,
// run tokens, temp dirs, and row factories. Every API test file should import
// from here instead of duplicating setTestEnv() / fake rows.
// ---------------------------------------------------------------------------

/** Gate for DB-backed integration tests: RUN_DB_TESTS=1 to enable. */
export const RUN_DB_TESTS = process.env.RUN_DB_TESTS === '1'

/** Per-run random token, so parallel/leftover DB rows never collide. */
export const RUN_TOKEN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Default DATABASE_URL the integration tests (and compose test DB) use. */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://serenique:serenique@127.0.0.1:5432/serenique'

/** Fallback signing secret for blob access-link tests (≥32 chars). */
export const TEST_SIGNING_SECRET = 'test-signing-secret-0123456789abcdef'

/** Fallback session cookie signing secret for tests (≥32 chars). */
export const TEST_SESSION_SECRET = 'test-session-secret-0123456789abcdef'

/**
 * Set test env vars. Must be called at the top of a test file, before any
 * module import that parses `@/env`.
 *
 * - DATABASE_URL keeps `??=` so tests respect the repo's `.env` database.
 * - BLOB_ROOT is forced (not `??=`): `@/env` is parsed once per `bun test`
 *   process and shared across files, so integration tests must never touch a
 *   real/production BLOB_ROOT regardless of which file imports `@/env` first.
 * - OIDC_* 默认指向本地假 IdP 常量（认证启用——HTTP 级测试必须带会话
 *   cookie 或 Bearer token）。所有测试文件共用同一份 env（bun test 单进程、
 *   先 import 先赢），所以不允许个别文件关闭认证；DB-free 的 smoke 测试用
 *   mock.module 替换 tokenService 即可。真正的 token 交换由集成测试 mock
 *   openid-client 层覆盖（不外呼真实 issuer）。
 */
export function setTestEnv(
  opts: {
    DATABASE_URL?: string
    BLOB_ROOT?: string
    BLOB_MAX_SIZE?: string
    BLOB_SIGNING_SECRET?: string
    SESSION_SECRET?: string
    OIDC_ISSUER?: string
    OIDC_CLIENT_ID?: string
    OIDC_CLIENT_SECRET?: string
    OIDC_REDIRECT_URI?: string
    NODE_ENV?: string
  } = {},
): void {
  process.env.DATABASE_URL ??= opts.DATABASE_URL ?? TEST_DATABASE_URL
  // Run-unique BLOB_ROOT (per `bun test` process), so every integration run
  // gets a fresh disk root and leftovers can never collide with a later run.
  process.env.BLOB_ROOT = opts.BLOB_ROOT ?? `/tmp/serenique-api-test-${RUN_TOKEN}`
  process.env.BLOB_MAX_SIZE ??= opts.BLOB_MAX_SIZE ?? '104857600'
  // Ensure the signing secret is set before `@/env` is first parsed — bun test
  // shares one process across files, and whichever file's setTestEnv runs
  // first wins for the cached `@/env` module.
  process.env.BLOB_SIGNING_SECRET ??= opts.BLOB_SIGNING_SECRET ?? TEST_SIGNING_SECRET
  // Session secret + OIDC 四元组 — always present so auth-enabled tests work.
  process.env.SESSION_SECRET ??= opts.SESSION_SECRET ?? TEST_SESSION_SECRET
  process.env.OIDC_ISSUER ??= opts.OIDC_ISSUER ?? 'https://auth.zeroicey.me'
  process.env.OIDC_CLIENT_ID ??= opts.OIDC_CLIENT_ID ?? 'test-client-id'
  process.env.OIDC_CLIENT_SECRET ??= opts.OIDC_CLIENT_SECRET ?? 'test-client-secret-0123456789'
  process.env.OIDC_REDIRECT_URI ??= opts.OIDC_REDIRECT_URI ?? 'http://localhost:5173/auth/callback'
  process.env.NODE_ENV ??= opts.NODE_ENV ?? 'test'
}

/** Title tagged with the run token, so integration cleanup can filter by prefix. */
export function uniqueTitle(tag: string): string {
  return `it-${tag}-${RUN_TOKEN}-${randomUUID().slice(0, 8)}`
}

/** Prefix that matches every uniqueTitle(tag) of this run. */
export function titlePrefix(tag: string): string {
  return `it-${tag}-${RUN_TOKEN}`
}

// ---- Row factories (for mapper / domain unit tests) -------------------------

export function fakeMomentRow(
  overrides: Partial<typeof moments.$inferSelect> = {},
): typeof moments.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001',
    text: '一条测试闪念',
    pinyin: null,
    pinyinInitial: null,
    location: null,
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
  }
}

export function fakeBlobRow(
  overrides: Partial<typeof blobs.$inferSelect> = {},
): typeof blobs.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f2001',
    originalName: 'photo.png',
    storagePath: 'image/2026/08/photo.png',
    mimeType: 'image/png',
    size: 2048,
    checksum: 'a'.repeat(64),
    metadata: {},
    width: 128,
    height: 64,
    duration: null,
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
  }
}

export function fakeTaskGroupRow(
  overrides: Partial<typeof taskGroups.$inferSelect> = {},
): typeof taskGroups.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
    title: '测试任务组',
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
  }
}

export function fakeEventRow(
  overrides: Partial<typeof events.$inferSelect> = {},
): typeof events.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f4001',
    title: '测试事件',
    startAt: new Date('2026-08-05T09:00:00.000Z'),
    endAt: new Date('2026-08-05T10:00:00.000Z'),
    isAllDay: false,
    location: null,
    note: null,
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
  }
}

export function fakeTaskRow(
  overrides: Partial<typeof tasks.$inferSelect> = {},
): typeof tasks.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3002',
    groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
    title: '测试任务',
    status: 'todo',
    dueDate: null,
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    completedAt: null,
    ...overrides,
  }
}

export function fakeTagRow(
  overrides: Partial<typeof tags.$inferSelect> = {},
): typeof tags.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f5001',
    name: '工作',
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
  }
}

export function fakeTagRelationRow(
  overrides: Partial<typeof tagRelations.$inferSelect> = {},
): typeof tagRelations.$inferSelect {
  return {
    id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f5002',
    tagId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f5001',
    ownerType: 'moment',
    ownerId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001',
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
  }
}
