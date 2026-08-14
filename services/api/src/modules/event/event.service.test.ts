import { describe, expect, test } from 'bun:test'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Event module unit tests — pure functions (event.domain), mappers and Zod
// schemas only. No database needed.
// ---------------------------------------------------------------------------

const START = new Date('2026-08-05T09:00:00.000Z')
const END = new Date('2026-08-05T10:00:00.000Z')

describe('assertValidEventRange — end must be strictly after start', () => {
  test('accepts a well-formed range', async () => {
    setTestEnv()
    const { assertValidEventRange } = await import('./event.domain')
    expect(() => assertValidEventRange(START, END)).not.toThrow()
  })

  test('rejects end == start', async () => {
    setTestEnv()
    const { assertValidEventRange } = await import('./event.domain')
    expect(() => assertValidEventRange(START, START)).toThrow(/结束时间必须晚于开始时间/)
  })

  test('rejects end < start', async () => {
    setTestEnv()
    const { assertValidEventRange } = await import('./event.domain')
    expect(() => assertValidEventRange(END, START)).toThrow(/结束时间必须晚于开始时间/)
  })
})

describe('assertValidListRange — to must be after from', () => {
  test('accepts a well-formed window', async () => {
    setTestEnv()
    const { assertValidListRange } = await import('./event.domain')
    expect(() => assertValidListRange(START, END)).not.toThrow()
  })

  test('rejects an empty or inverted window', async () => {
    setTestEnv()
    const { assertValidListRange } = await import('./event.domain')
    expect(() => assertValidListRange(START, START)).toThrow(/查询时间范围无效/)
    expect(() => assertValidListRange(END, START)).toThrow(/查询时间范围无效/)
  })
})

describe('resolveEventUpdate — combines patch with current row', () => {
  const current = {
    title: '晨会',
    startAt: START,
    endAt: END,
    isAllDay: false,
    location: null,
    note: null,
  }

  test('a title-only patch keeps everything else unchanged', async () => {
    setTestEnv()
    const { resolveEventUpdate } = await import('./event.domain')

    const result = resolveEventUpdate(current, { title: '周会' })

    expect(result).toEqual({ ...current, title: '周会' })
  })

  test('an empty patch resolves to the current values unchanged', async () => {
    setTestEnv()
    const { resolveEventUpdate } = await import('./event.domain')

    expect(resolveEventUpdate(current, {})).toEqual(current)
  })

  test('patches a single time field while keeping the range valid', async () => {
    setTestEnv()
    const { resolveEventUpdate } = await import('./event.domain')

    const result = resolveEventUpdate(current, {
      startAt: new Date('2026-08-05T09:30:00.000Z'),
    })

    expect(result.startAt.toISOString()).toBe('2026-08-05T09:30:00.000Z')
    expect(result.endAt).toEqual(END)
  })

  test('rejects a merged range where end <= start', async () => {
    setTestEnv()
    const { resolveEventUpdate } = await import('./event.domain')

    expect(() =>
      resolveEventUpdate(current, {
        startAt: new Date('2026-08-05T11:00:00.000Z'),
      }),
    ).toThrow(/结束时间必须晚于开始时间/)
    expect(() =>
      resolveEventUpdate(current, {
        endAt: new Date('2026-08-05T08:00:00.000Z'),
      }),
    ).toThrow(/结束时间必须晚于开始时间/)
  })

  test('location/note are only replaced when present (empty string clears)', async () => {
    setTestEnv()
    const { resolveEventUpdate } = await import('./event.domain')

    const withPlace = resolveEventUpdate(current, { location: '会议室 A' })
    expect(withPlace.location).toBe('会议室 A')
    expect(withPlace.note).toBeNull()

    const cleared = resolveEventUpdate(withPlace, { location: '' })
    expect(cleared.location).toBe('')
  })
})

describe('event zod schemas', () => {
  const validCreate = {
    title: '产品评审',
    startAt: '2026-08-05T09:00:00+08:00',
    endAt: '2026-08-05T10:00:00+08:00',
  }

  test('CreateEventSchema accepts a valid payload and defaults isAllDay to false', async () => {
    setTestEnv()
    const { CreateEventSchema } = await import('./event.types')

    const parsed = CreateEventSchema.parse(validCreate)
    expect(parsed.isAllDay).toBe(false)
    expect(parsed.location).toBeUndefined()
  })

  test('CreateEventSchema accepts explicit isAllDay / location / note', async () => {
    setTestEnv()
    const { CreateEventSchema } = await import('./event.types')

    const parsed = CreateEventSchema.parse({
      ...validCreate,
      isAllDay: true,
      location: ' 会议室 ',
      note: ' 带上设计稿 ',
    })
    expect(parsed.isAllDay).toBe(true)
    expect(parsed.location).toBe('会议室')
    expect(parsed.note).toBe('带上设计稿')
  })

  test('CreateEventSchema rejects an empty or too-long title', async () => {
    setTestEnv()
    const { CreateEventSchema } = await import('./event.types')

    expect(CreateEventSchema.safeParse({ ...validCreate, title: '' }).success).toBe(false)
    expect(CreateEventSchema.safeParse({ ...validCreate, title: '   ' }).success).toBe(false)
    expect(
      CreateEventSchema.safeParse({
        ...validCreate,
        title: 'x'.repeat(201),
      }).success,
    ).toBe(false)
  })

  test('CreateEventSchema rejects invalid or offset-less datetimes', async () => {
    setTestEnv()
    const { CreateEventSchema } = await import('./event.types')

    expect(
      CreateEventSchema.safeParse({
        ...validCreate,
        startAt: 'not-a-date',
      }).success,
    ).toBe(false)
    // z.iso.datetime requires a timezone offset.
    expect(
      CreateEventSchema.safeParse({
        ...validCreate,
        startAt: '2026-08-05T09:00:00',
      }).success,
    ).toBe(false)
    // Missing endAt entirely.
    expect(
      CreateEventSchema.safeParse({ title: '产品评审', startAt: '2026-08-05T09:00:00Z' }).success,
    ).toBe(false)
  })

  test('UpdateEventSchema requires at least one field', async () => {
    setTestEnv()
    const { UpdateEventSchema } = await import('./event.types')

    expect(UpdateEventSchema.safeParse({}).success).toBe(false)
    expect(UpdateEventSchema.safeParse({ title: '新标题' }).success).toBe(true)
    expect(UpdateEventSchema.safeParse({ isAllDay: true }).success).toBe(true)
    expect(UpdateEventSchema.safeParse({ endAt: '2026-08-05T12:00:00Z' }).success).toBe(true)
  })

  test('ListEventSchema requires ISO from/to', async () => {
    setTestEnv()
    const { ListEventSchema } = await import('./event.types')

    expect(
      ListEventSchema.safeParse({
        from: '2026-08-05T00:00:00Z',
        to: '2026-08-06T00:00:00Z',
      }).success,
    ).toBe(true)
    expect(
      ListEventSchema.safeParse({
        from: '2026-08-05T00:00:00Z',
      }).success,
    ).toBe(false)
    expect(
      ListEventSchema.safeParse({
        from: '2026-08-05',
        to: '2026-08-06T00:00:00Z',
      }).success,
    ).toBe(false)
  })
})

describe('event mappers', () => {
  test('toEventEntry converts a row to an entry with ISO timestamps', async () => {
    setTestEnv()
    const { toEventEntry } = await import('./event.mappers')
    const { fakeEventRow } = await import('@/test/helpers')

    expect(toEventEntry(fakeEventRow())).toEqual({
      id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f4001',
      title: '测试事件',
      startAt: '2026-08-05T09:00:00.000Z',
      endAt: '2026-08-05T10:00:00.000Z',
      isAllDay: false,
      location: null,
      note: null,
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
    })
  })

  test('toEventEntry carries nullable fields and all-day flag', async () => {
    setTestEnv()
    const { toEventEntry } = await import('./event.mappers')
    const { fakeEventRow } = await import('@/test/helpers')

    const entry = toEventEntry(
      fakeEventRow({
        isAllDay: true,
        location: '会议室',
        note: '带设备',
      }),
    )
    expect(entry.isAllDay).toBe(true)
    expect(entry.location).toBe('会议室')
    expect(entry.note).toBe('带设备')
  })
})
