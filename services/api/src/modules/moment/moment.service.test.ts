import { describe, expect, test } from 'bun:test'
import { fakeBlobRow, fakeMomentRow, setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Moment unit tests — domain pure functions, mappers and Zod schemas. No DB.
// ---------------------------------------------------------------------------

describe('moment domain — mime whitelist', () => {
  test('isAllowedMomentMimeType accepts image/audio/video, case/param-insensitive', async () => {
    setTestEnv()
    const { isAllowedMomentMimeType } = await import('./moment.domain')

    expect(isAllowedMomentMimeType('image/png')).toBe(true)
    expect(isAllowedMomentMimeType('audio/mpeg')).toBe(true)
    expect(isAllowedMomentMimeType('video/mp4')).toBe(true)
    expect(isAllowedMomentMimeType('IMAGE/PNG')).toBe(true)
    expect(isAllowedMomentMimeType('image/png; charset=utf-8')).toBe(true)
  })

  test('isAllowedMomentMimeType rejects svg and non-media', async () => {
    setTestEnv()
    const { isAllowedMomentMimeType } = await import('./moment.domain')

    expect(isAllowedMomentMimeType('image/svg+xml')).toBe(false)
    expect(isAllowedMomentMimeType('application/pdf')).toBe(false)
    expect(isAllowedMomentMimeType('text/plain')).toBe(false)
    expect(isAllowedMomentMimeType('')).toBe(false)
  })

  test('assertAllowedMomentBlob throws VALIDATION for disallowed mime', async () => {
    setTestEnv()
    const { assertAllowedMomentBlob } = await import('./moment.domain')

    expect(() => assertAllowedMomentBlob({ mimeType: 'image/png' })).not.toThrow()
    expect(() => assertAllowedMomentBlob({ mimeType: 'application/pdf' })).toThrow()
  })
})

describe('moment domain — sort order', () => {
  test('normalizeSortOrder falls back when value is undefined', async () => {
    setTestEnv()
    const { normalizeSortOrder } = await import('./moment.domain')

    expect(normalizeSortOrder(undefined, 5)).toBe(5)
    expect(normalizeSortOrder(0, 5)).toBe(0)
    expect(normalizeSortOrder(2, 5)).toBe(2)
  })

  test('normalizeSortOrder rejects non-integer values', async () => {
    setTestEnv()
    const { normalizeSortOrder } = await import('./moment.domain')

    expect(() => normalizeSortOrder(1.5, 0)).toThrow()
    expect(() => normalizeSortOrder('x', 0)).toThrow()
  })
})

describe('moment domain — pinyin derived columns', () => {
  test('toPinyinColumns: Chinese maps to compact full pinyin + initials', async () => {
    setTestEnv()
    const { toPinyinColumns } = await import('./moment.domain')

    expect(toPinyinColumns('北京')).toEqual({
      pinyin: 'beijing',
      pinyinInitial: 'bj',
    })
  })

  test('toPinyinColumns: mixed Chinese/English keeps English verbatim', async () => {
    setTestEnv()
    const { toPinyinColumns } = await import('./moment.domain')

    expect(toPinyinColumns('hello 中文')).toEqual({
      pinyin: 'hello zhongwen',
      pinyinInitial: 'hello zw',
    })
    expect(toPinyinColumns('北京 meeting')).toEqual({
      pinyin: 'beijing meeting',
      pinyinInitial: 'bj meeting',
    })
  })

  test('toPinyinColumns: polyphonic characters use the common reading', async () => {
    setTestEnv()
    const { toPinyinColumns } = await import('./moment.domain')

    expect(toPinyinColumns('银行')).toEqual({
      pinyin: 'yinhang',
      pinyinInitial: 'yh',
    })
  })

  test("toPinyinColumns: v:true maps ü to v so 'lv' matches 吕", async () => {
    setTestEnv()
    const { toPinyinColumns } = await import('./moment.domain')

    expect(toPinyinColumns('吕').pinyin).toBe('lv')
  })

  test('toPinyinColumns: empty/whitespace-only text yields empty strings', async () => {
    setTestEnv()
    const { toPinyinColumns } = await import('./moment.domain')

    expect(toPinyinColumns('')).toEqual({ pinyin: '', pinyinInitial: '' })
    expect(toPinyinColumns('  ')).toEqual({ pinyin: '', pinyinInitial: '' })
  })

  test('toPinyinColumns: output is lowercase and ASCII (no tone marks)', async () => {
    setTestEnv()
    const { toPinyinColumns } = await import('./moment.domain')

    const { pinyin: full } = toPinyinColumns('中文 Hello 北京')
    expect(full).toBe(full.toLowerCase())
    expect(full).not.toMatch(/[éǚüā]/)
  })
})

describe('moment domain — LIKE pattern escaping', () => {
  test('toLikePattern wraps the keyword in %…% and escapes % _ \\', async () => {
    setTestEnv()
    const { toLikePattern } = await import('./moment.domain')

    expect(toLikePattern('beijing')).toBe('%beijing%')
    expect(toLikePattern('100%')).toBe('%100\\%%')
    expect(toLikePattern('a_b')).toBe('%a\\_b%')
    expect(toLikePattern('c\\d')).toBe('%c\\\\d%')
  })
})

describe('moment mappers', () => {
  function makeAttachmentEntry(id: string, sortOrder: number, createdAt: string) {
    return {
      id,
      blobId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f2001',
      role: 'attachment',
      displayName: null,
      sortOrder,
      metadata: {},
      createdAt,
      updatedAt: createdAt,
      blob: {
        id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f2001',
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 2048,
        metadata: {},
        width: 128,
        height: 64,
        duration: null,
        createdAt,
        fileUrl: '/api/blobs/0198f6d0-9e7c-71d7-8214-2a0f7f5f2001/file',
      },
    }
  }

  test('toMomentBlobEntry exposes fileUrl and ISO createdAt, not storagePath', async () => {
    setTestEnv()
    const { toMomentBlobEntry } = await import('./moment.mappers')

    const entry = toMomentBlobEntry(fakeBlobRow())
    expect(entry.fileUrl).toBe(`/api/blobs/${entry.id}/file`)
    expect(entry.createdAt).toBe('2026-08-05T12:00:00.000Z')
    expect(entry).not.toHaveProperty('storagePath')
  })

  test('toMomentAttachmentEntry nests the mapped blob', async () => {
    setTestEnv()
    const { toMomentAttachmentEntry } = await import('./moment.mappers')

    const entry = toMomentAttachmentEntry({
      attachment: {
        id: 'att-1',
        blobId: fakeBlobRow().id,
        ownerType: 'moment',
        ownerId: 'moment-1',
        role: 'attachment',
        displayName: 'cover.png',
        sortOrder: 3,
        metadata: { alt: 'photo' },
        createdAt: new Date('2026-08-05T12:00:00.000Z'),
        updatedAt: new Date('2026-08-05T12:00:00.000Z'),
      },
      blob: fakeBlobRow(),
    })

    expect(entry.id).toBe('att-1')
    expect(entry.displayName).toBe('cover.png')
    expect(entry.metadata).toEqual({ alt: 'photo' })
    expect(entry.blob).toMatchObject({
      id: fakeBlobRow().id,
      fileUrl: `/api/blobs/${fakeBlobRow().id}/file`,
    })
  })

  test('sortAttachments sorts by sortOrder and never mutates the input', async () => {
    setTestEnv()
    const { sortAttachments } = await import('./moment.mappers')

    const attachments = [
      makeAttachmentEntry('c', 2, '2026-08-05T10:00:00.000Z'),
      makeAttachmentEntry('a', 0, '2026-08-05T12:00:00.000Z'),
      makeAttachmentEntry('b', 1, '2026-08-05T11:00:00.000Z'),
    ]
    const sorted = sortAttachments(attachments)

    expect(sorted.map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(attachments[0].id).toBe('c')
  })

  test('toMomentEntry defaults comments to [] and commentCount to comments.length', async () => {
    setTestEnv()
    const { toMomentEntry } = await import('./moment.mappers')

    const empty = toMomentEntry(fakeMomentRow())
    expect(empty.comments).toEqual([])
    expect(empty.commentCount).toBe(0)

    const comments = [
      {
        id: 'c1',
        momentId: fakeMomentRow().id,
        content: '备注',
        createdAt: '2026-08-05T10:00:00.000Z',
        updatedAt: '2026-08-05T10:00:00.000Z',
      },
    ]
    const withComments = toMomentEntry(fakeMomentRow(), [], comments)
    expect(withComments.comments).toHaveLength(1)
    expect(withComments.commentCount).toBe(1)

    // List path: comments not loaded, but commentCount may still be non-zero.
    const listEntry = toMomentEntry(fakeMomentRow(), [], [], 3)
    expect(listEntry.comments).toEqual([])
    expect(listEntry.commentCount).toBe(3)
  })

  test('toMomentEntry carries the location through', async () => {
    setTestEnv()
    const { toMomentEntry } = await import('./moment.mappers')

    const located = toMomentEntry(
      fakeMomentRow({
        location: { name: '北京·三里屯', latitude: 39.9, longitude: 116.4 },
      }),
    )
    expect(located.location).toEqual({
      name: '北京·三里屯',
      latitude: 39.9,
      longitude: 116.4,
    })

    const plain = toMomentEntry(fakeMomentRow())
    expect(plain.location).toBeNull()
  })

  test('toMomentEntry never exposes the derived pinyin columns', async () => {
    setTestEnv()
    const { toMomentEntry } = await import('./moment.mappers')

    const entry = toMomentEntry(fakeMomentRow({ pinyin: 'beijing', pinyinInitial: 'bj' }))
    expect(entry).not.toHaveProperty('pinyin')
    expect(entry).not.toHaveProperty('pinyinInitial')
  })

  test('groupAttachmentsByMomentId groups by ownerId and sorts each group', async () => {
    setTestEnv()
    const { groupAttachmentsByMomentId } = await import('./moment.mappers')
    const m1 = '0198f6d0-9e7c-71d7-8214-2a0f7f5f1001'
    const m2 = '0198f6d0-9e7c-71d7-8214-2a0f7f5f1002'
    const joinRow = (ownerId: string, id: string, sortOrder: number) => ({
      attachment: {
        id,
        blobId: fakeBlobRow().id,
        ownerType: 'moment',
        ownerId,
        role: 'attachment',
        displayName: null,
        sortOrder,
        metadata: {},
        createdAt: new Date('2026-08-05T10:00:00.000Z'),
        updatedAt: new Date('2026-08-05T10:00:00.000Z'),
      },
      blob: fakeBlobRow(),
    })

    const grouped = groupAttachmentsByMomentId([
      joinRow(m1, 'att-2', 2),
      joinRow(m2, 'att-1', 0),
      joinRow(m1, 'att-1', 1),
    ])

    expect([...grouped.keys()].sort()).toEqual([m1, m2])
    expect(grouped.get(m1)!.map((a) => a.id)).toEqual(['att-1', 'att-2'])
    expect(grouped.get(m2)!.map((a) => a.id)).toEqual(['att-1'])
  })
})

describe('moment schemas', () => {
  test('CreateMomentSchema requires text ≤10000 and defaults attachments to []', async () => {
    setTestEnv()
    const { CreateMomentSchema } = await import('./moment.types')

    expect(CreateMomentSchema.safeParse({ text: 'hello' }).success).toBe(true)
    expect(CreateMomentSchema.safeParse({ content: 'hello' }).success).toBe(false)
    expect(CreateMomentSchema.safeParse({ text: '' }).success).toBe(false)
    expect(CreateMomentSchema.safeParse({ text: 'x'.repeat(10001) }).success).toBe(false)
    expect(CreateMomentSchema.parse({ text: 'hello' }).attachments).toEqual([])
  })

  test('CreateMomentSchema accepts an optional location object', async () => {
    setTestEnv()
    const { CreateMomentSchema } = await import('./moment.types')

    expect(
      CreateMomentSchema.safeParse({
        text: 'hello',
        location: { name: '北京·三里屯', latitude: 39.9, longitude: 116.4 },
      }).success,
    ).toBe(true)
    // Coordinates alone are fine (frontend may only have a pin).
    expect(
      CreateMomentSchema.safeParse({
        text: 'hello',
        location: { latitude: 39.9, longitude: 116.4 },
      }).success,
    ).toBe(true)
    // Name-only is fine too (frontend may not expose coordinates).
    expect(
      CreateMomentSchema.safeParse({
        text: 'hello',
        location: { name: '北京·三里屯' },
      }).success,
    ).toBe(true)
    // Old clients simply omit the field.
    expect(CreateMomentSchema.parse({ text: 'hello' }).location).toBeUndefined()
  })

  test('CreateMomentSchema rejects empty/invalid location objects', async () => {
    setTestEnv()
    const { CreateMomentSchema } = await import('./moment.types')

    const withLocation = (location: unknown) =>
      CreateMomentSchema.safeParse({ text: 'hello', location })

    expect(withLocation({}).success).toBe(false)
    expect(withLocation({ name: '' }).success).toBe(false)
    expect(withLocation({ name: 'x'.repeat(129) }).success).toBe(false)
    expect(withLocation({ latitude: 91 }).success).toBe(false)
    expect(withLocation({ latitude: -91 }).success).toBe(false)
    expect(withLocation({ longitude: 181 }).success).toBe(false)
    expect(withLocation({ longitude: '116.4' }).success).toBe(false)
  })

  test('UpdateMomentSchema requires text 1-10000 and rejects unknown body fields', async () => {
    setTestEnv()
    const { UpdateMomentSchema } = await import('./moment.types')

    expect(UpdateMomentSchema.safeParse({ text: '新内容' }).success).toBe(true)
    expect(UpdateMomentSchema.safeParse({ text: '' }).success).toBe(false)
    expect(UpdateMomentSchema.safeParse({ text: 'x'.repeat(10001) }).success).toBe(false)
    expect(UpdateMomentSchema.safeParse({ content: 'hello' }).success).toBe(false)
  })

  test('UpdateMomentSchema location is three-state: absent / null / object', async () => {
    setTestEnv()
    const { UpdateMomentSchema } = await import('./moment.types')

    // absent = unchanged (old clients PUT text only and keep the location)
    expect(UpdateMomentSchema.parse({ text: '新内容' }).location).toBeUndefined()
    // null = clear
    expect(UpdateMomentSchema.parse({ text: '新内容', location: null }).location).toBeNull()
    // object = set/overwrite
    expect(
      UpdateMomentSchema.parse({
        text: '新内容',
        location: { name: '公司' },
      }).location,
    ).toEqual({ name: '公司' })
    // invalid location still rejected
    expect(UpdateMomentSchema.safeParse({ text: '新内容', location: {} }).success).toBe(false)
  })

  test('MomentAttachmentInputSchema defaults role/metadata and rejects non-uuid blobId', async () => {
    setTestEnv()
    const { MomentAttachmentInputSchema } = await import('./moment.types')

    const parsed = MomentAttachmentInputSchema.parse({
      blobId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f2001',
    })
    expect(parsed.role).toBe('attachment')
    expect(parsed.metadata).toEqual({})
    expect(MomentAttachmentInputSchema.safeParse({ blobId: 'not-a-uuid' }).success).toBe(false)
  })

  test('ListMomentSchema coerces pagination', async () => {
    setTestEnv()
    const { ListMomentSchema } = await import('./moment.types')

    expect(ListMomentSchema.parse({})).toMatchObject({ page: 1, pageSize: 10 })
    expect(ListMomentSchema.parse({ page: '2' })).toMatchObject({ page: 2 })
  })

  test('ListMomentSchema q: optional, trimmed, 1-100 chars', async () => {
    setTestEnv()
    const { ListMomentSchema } = await import('./moment.types')

    // absent → full list (existing behavior)
    expect(ListMomentSchema.parse({}).q).toBeUndefined()
    expect(ListMomentSchema.parse({ q: 'beijing' }).q).toBe('beijing')
    // trimmed before validation
    expect(ListMomentSchema.parse({ q: '  beijing  ' }).q).toBe('beijing')
    // empty-after-trim rejected
    expect(ListMomentSchema.safeParse({ q: '' }).success).toBe(false)
    expect(ListMomentSchema.safeParse({ q: '   ' }).success).toBe(false)
    // length bound
    expect(ListMomentSchema.safeParse({ q: 'x'.repeat(100) }).success).toBe(true)
    expect(ListMomentSchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false)
  })

  test('ListMomentSchema createdFrom/createdTo: optional ISO datetime window', async () => {
    setTestEnv()
    const { ListMomentSchema } = await import('./moment.types')

    // absent → no window (existing full-list behavior)
    expect(ListMomentSchema.parse({}).createdFrom).toBeUndefined()
    expect(ListMomentSchema.parse({}).createdTo).toBeUndefined()

    // valid ISO datetimes pass through unchanged
    const parsed = ListMomentSchema.parse({
      createdFrom: '2026-08-01T00:00:00.000Z',
      createdTo: '2026-08-31T23:59:59.000Z',
    })
    expect(parsed.createdFrom).toBe('2026-08-01T00:00:00.000Z')
    expect(parsed.createdTo).toBe('2026-08-31T23:59:59.000Z')

    // offset form (Z or ±hh:mm, same as event from/to) accepted
    expect(
      ListMomentSchema.safeParse({
        createdFrom: '2026-08-05T10:00:00+08:00',
      }).success,
    ).toBe(true)

    // invalid date strings rejected
    expect(ListMomentSchema.safeParse({ createdFrom: 'not-a-date' }).success).toBe(false)
    expect(ListMomentSchema.safeParse({ createdTo: 'not-a-date' }).success).toBe(false)
  })
})
