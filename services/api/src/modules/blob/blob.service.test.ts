import { describe, expect, test } from 'bun:test'
import { fakeBlobRow, setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Blob unit tests — domain pure functions, mappers, Zod schemas. No real DB
// or disk needed. (The upload size guard is a pure domain function so it is
// tested without depending on process env timing.)
// ---------------------------------------------------------------------------

setTestEnv()

describe('blob domain — error guards', () => {
  test('assertBlobSize rejects files over the limit with 413', async () => {
    setTestEnv()
    const { assertBlobSize } = await import('./blob.domain')

    expect(() => assertBlobSize(2048, 1024)).toThrow()
    expect(() => assertBlobSize(1024, 1024)).not.toThrow()
  })

  test('isChecksumUniqueConflict matches only checksum unique violations', async () => {
    setTestEnv()
    const { isChecksumUniqueConflict } = await import('./blob.domain')

    expect(
      isChecksumUniqueConflict({
        code: '23505',
        constraint: 'blobs_checksum_unique',
      }),
    ).toBe(true)
    // PostgresJS driver also reports the constraint as constraint_name.
    expect(
      isChecksumUniqueConflict({
        code: '23505',
        constraint_name: 'blobs_checksum_unique',
      }),
    ).toBe(true)
    // drizzle-orm wraps the driver error under `.cause`.
    expect(
      isChecksumUniqueConflict({
        cause: {
          code: '23505',
          constraint_name: 'blobs_checksum_unique',
        },
      }),
    ).toBe(true)
    expect(isChecksumUniqueConflict({ code: '23505', constraint: 'other' })).toBe(false)
    expect(isChecksumUniqueConflict({ code: '23503' })).toBe(false)
    expect(isChecksumUniqueConflict(null)).toBe(false)
    expect(isChecksumUniqueConflict('boom')).toBe(false)
  })

  test('errorMessage extracts the message or stringifies', async () => {
    setTestEnv()
    const { errorMessage } = await import('./blob.domain')

    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('raw')).toBe('raw')
    expect(errorMessage(42)).toBe('42')
  })
})

describe('blob domain — MIME sniffing', () => {
  test('looksLikeSvg detects <svg and <?xml+<svg, with BOM tolerance', async () => {
    setTestEnv()
    const { looksLikeSvg } = await import('./blob.domain')

    expect(looksLikeSvg(Buffer.from('<svg xmlns=...'))).toBe(true)
    expect(looksLikeSvg(Buffer.from('<?xml version="1.0"?><svg>'))).toBe(true)
    expect(looksLikeSvg(Buffer.from('﻿<svg>'))).toBe(true)
    expect(looksLikeSvg(Buffer.from('PNG...'))).toBe(false)
    expect(looksLikeSvg(Buffer.from('plain text'))).toBe(false)
  })

  test('normalizeUploadedMimeType overrides SVG-looking content', async () => {
    setTestEnv()
    const { normalizeUploadedMimeType } = await import('./blob.domain')

    const svgBuf = Buffer.from('<svg>')
    expect(normalizeUploadedMimeType({ type: 'image/png' }, svgBuf)).toBe('image/svg+xml')
    expect(normalizeUploadedMimeType({ type: 'image/png' }, Buffer.from('not svg'))).toBe(
      'image/png',
    )
    expect(normalizeUploadedMimeType({ type: '' }, Buffer.from('data'))).toBe(
      'application/octet-stream',
    )
  })
})

describe('blob domain — access signatures', () => {
  test('signBlobAccess is deterministic and signaturesEqual guards', async () => {
    setTestEnv()
    const { signBlobAccess, signaturesEqual } = await import('./blob.domain')

    const sig = signBlobAccess('secret', 'blob-1', 12345)
    expect(signBlobAccess('secret', 'blob-1', 12345)).toBe(sig)
    expect(signBlobAccess('secret', 'blob-1', 99999)).not.toBe(sig)
    expect(signaturesEqual(sig, sig)).toBe(true)
    expect(signaturesEqual(sig, `${sig.slice(0, -1)}x`)).toBe(false)
    expect(signaturesEqual(sig, 'short')).toBe(false)
  })

  test('signR2Access hex output matches the worker gateway signing domain (fixed vector)', async () => {
    setTestEnv()
    const { signR2Access } = await import('./blob.domain')
    // 固定向量：与 infra/r2-gateway/gateway.js 的 validSignature 同域
    // （HMAC-SHA256(secret, `v1:${storagePath}:${expires}`) → hex）。
    // 用 node:crypto 独立复算并锁定期望值：任一侧改动签名域都会在此失败。
    // 注意：此处是测试专用伪 secret，绝不放入真实生产 secret。
    const { createHmac } = await import('node:crypto')
    const secret = 'test-r2-signing-secret-0123456789abcdef'
    const path = 'image/2026/08/abc-123.jpg'
    const expires = 1755667200
    const expected = createHmac('sha256', secret).update(`v1:${path}:${expires}`).digest('hex')
    expect(signR2Access(secret, path, expires)).toBe(expected)
    expect(signR2Access(secret, path, expires)).toMatch(/^[0-9a-f]{64}$/)
    // 不同 path / expires 必须产出不同签名
    expect(signR2Access(secret, `${path}x`, expires)).not.toBe(expected)
    expect(signR2Access(secret, path, expires + 1)).not.toBe(expected)
  })

  test('signR2Put hex output matches the worker PUT signing domain (fixed vector)', async () => {
    setTestEnv()
    const { signR2Put } = await import('./blob.domain')
    // 与 infra/r2-gateway/gateway.js PUT 分支同域：HMAC(secret, `up:${path}:${expires}:${size}`)→hex。
    const { createHmac } = await import('node:crypto')
    const secret = 'test-r2-signing-secret-0123456789abcdef'
    const path = 'image/2026/08/abc-123.jpg'
    const expires = 1755667200
    const size = 4096
    const expected = createHmac('sha256', secret)
      .update(`up:${path}:${expires}:${size}`)
      .digest('hex')
    expect(signR2Put(secret, path, expires, size)).toBe(expected)
    expect(signR2Put(secret, path, expires, size)).toMatch(/^[0-9a-f]{64}$/)
    // size 参与签名：不同 size / path / expires 必须不同
    expect(signR2Put(secret, path, expires, size + 1)).not.toBe(expected)
    expect(signR2Put(secret, `${path}x`, expires, size)).not.toBe(expected)
  })

  test('signR2Delete hex output matches the worker DELETE signing domain (fixed vector)', async () => {
    setTestEnv()
    const { signR2Delete } = await import('./blob.domain')
    // 与 infra/r2-gateway/gateway.js DELETE 分支同域：
    // HMAC(secret, `del:${path}:${expires}`)→hex（用 node:crypto 独立复算锁定）。
    const { createHmac } = await import('node:crypto')
    const secret = 'test-r2-signing-secret-0123456789abcdef'
    const path = 'image/2026/08/abc-123.jpg'
    const expires = 1755667200
    const expected = createHmac('sha256', secret).update(`del:${path}:${expires}`).digest('hex')
    expect(signR2Delete(secret, path, expires)).toBe(expected)
    expect(signR2Delete(secret, path, expires)).toMatch(/^[0-9a-f]{64}$/)
    // 不同 path / expires 必须产出不同签名
    expect(signR2Delete(secret, `${path}x`, expires)).not.toBe(expected)
    expect(signR2Delete(secret, path, expires + 1)).not.toBe(expected)
  })

  test('requireSigningSecret throws INTERNAL when missing', async () => {
    setTestEnv()
    const { requireSigningSecret } = await import('./blob.domain')

    expect(requireSigningSecret('a-secret')).toBe('a-secret')
    expect(() => requireSigningSecret(undefined)).toThrow()
    expect(() => requireSigningSecret('')).toThrow()
  })
})

describe('blob domain — owner type guard', () => {
  test('assertGenericAttachmentOwnerType rejects reserved types', async () => {
    setTestEnv()
    const { assertGenericAttachmentOwnerType } = await import('./blob.domain')

    expect(() => assertGenericAttachmentOwnerType('moment')).toThrow()
    expect(() => assertGenericAttachmentOwnerType('drive')).not.toThrow()
  })
})

describe('blob mappers', () => {
  test('toPublicBlobEntry converts a row and never exposes storagePath', async () => {
    setTestEnv()
    const { toPublicBlobEntry } = await import('./blob.mappers')

    const entry = toPublicBlobEntry(fakeBlobRow())
    expect(entry).toMatchObject({
      id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f2001',
      originalName: 'photo.png',
      mimeType: 'image/png',
      size: 2048,
      width: 128,
      height: 64,
      duration: null,
      createdAt: '2026-08-05T12:00:00.000Z',
    })
    expect(entry).not.toHaveProperty('storagePath')
  })

  test('toBlobAttachmentEntry converts an attachment row', async () => {
    setTestEnv()
    const { toBlobAttachmentEntry } = await import('./blob.mappers')

    const entry = toBlobAttachmentEntry({
      id: 'att-1',
      blobId: fakeBlobRow().id,
      ownerType: 'moment',
      ownerId: 'moment-1',
      role: 'attachment',
      displayName: null,
      sortOrder: 0,
      metadata: {},
      createdAt: new Date('2026-08-05T12:00:00.000Z'),
      updatedAt: new Date('2026-08-05T12:00:00.000Z'),
    })
    expect(entry).toMatchObject({
      id: 'att-1',
      ownerType: 'moment',
      sortOrder: 0,
      createdAt: '2026-08-05T12:00:00.000Z',
    })
  })
})

describe('blob schemas', () => {
  test('ListBlobSchema coerces pagination and accepts a mimeType prefix', async () => {
    setTestEnv()
    const { ListBlobSchema } = await import('./blob.types')

    expect(ListBlobSchema.parse({})).toMatchObject({ page: 1, pageSize: 20 })
    expect(ListBlobSchema.parse({ page: '2', pageSize: '5', mimeType: 'image/' })).toMatchObject({
      page: 2,
      pageSize: 5,
      mimeType: 'image/',
    })
  })

  test('CreateBlobAttachmentSchema defaults role/metadata/sortOrder', async () => {
    setTestEnv()
    const { CreateBlobAttachmentSchema } = await import('./blob.types')

    const parsed = CreateBlobAttachmentSchema.parse({
      ownerType: 'drive',
      ownerId: 'd1',
    })
    expect(parsed.role).toBe('attachment')
    expect(parsed.metadata).toEqual({})
    expect(parsed.sortOrder).toBe(0)
  })

  test('CreateBlobAccessLinkSchema bounds expiresInSeconds', async () => {
    setTestEnv()
    const { CreateBlobAccessLinkSchema } = await import('./blob.types')

    expect(CreateBlobAccessLinkSchema.parse({}).expiresInSeconds).toBe(15 * 60)
    expect(CreateBlobAccessLinkSchema.parse({ expiresInSeconds: '30' }).expiresInSeconds).toBe(30)
    expect(CreateBlobAccessLinkSchema.safeParse({ expiresInSeconds: 0 }).success).toBe(false)
    expect(
      CreateBlobAccessLinkSchema.safeParse({
        expiresInSeconds: 8 * 24 * 60 * 60,
      }).success,
    ).toBe(false)
  })
})
