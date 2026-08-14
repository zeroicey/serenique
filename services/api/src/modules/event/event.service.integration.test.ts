import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { RUN_DB_TESTS, setTestEnv, titlePrefix, uniqueTitle } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Event service integration tests — exercise the real service + Drizzle ORM
// against PostgreSQL (docker compose test DB, see docker-compose.test.yml).
//
// GATED: the whole suite is skipped unless RUN_DB_TESTS=1 is set, so plain
// `bun test` stays green when the database is not running. One-shot run:
//
//   cd services/api && bun run test:integration:full
//
// Cleanup: every event created here is tracked and deleted in afterAll. Titles
// carry a run-unique token so list assertions never collide with pre-existing
// data in the shared local database.
// ---------------------------------------------------------------------------

setTestEnv()

const createdEventIds: string[] = []

describe.skipIf(!RUN_DB_TESTS)('event service DB integration', () => {
  let service: typeof import('./event.service').eventService
  let db: typeof import('@/db/connection').db
  let eventsTable: typeof import('./event.schema').events

  beforeAll(async () => {
    setTestEnv()
    service = (await import('./event.service')).eventService
    db = (await import('@/db/connection')).db
    eventsTable = (await import('./event.schema')).events
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdEventIds.length === 0) return
    await db.delete(eventsTable).where(inArray(eventsTable.id, createdEventIds))
  })

  // ---- Create / get / update / delete round trip ---------------------------

  test('create / get / update / delete round trip', async () => {
    const created = await service.create({
      title: uniqueTitle('事件-往返'),
      startAt: '2026-08-10T09:00:00+08:00',
      endAt: '2026-08-10T10:00:00+08:00',
      location: '会议室',
      note: '带设计稿',
    })
    createdEventIds.push(created.id)

    expect(created.id).toBeTruthy()
    expect(created.title).toContain(titlePrefix('事件-往返'))
    expect(created.startAt).toBe('2026-08-10T01:00:00.000Z') // +08:00 → UTC
    expect(created.endAt).toBe('2026-08-10T02:00:00.000Z')
    expect(created.isAllDay).toBe(false)
    expect(created.location).toBe('会议室')
    expect(created.note).toBe('带设计稿')

    const got = await service.get({ id: created.id })
    expect(got.id).toBe(created.id)
    expect(got.title).toBe(created.title)

    // Title-only partial update.
    const renamedTitle = uniqueTitle('事件-往返-改名')
    const renamed = await service.update({
      id: created.id,
      title: renamedTitle,
    })
    expect(renamed.title).toBe(renamedTitle)
    expect(renamed.startAt).toBe(created.startAt)
    expect(renamed.location).toBe('会议室')

    // Reschedule startAt within the event's own range.
    const rescheduled = await service.update({
      id: created.id,
      startAt: '2026-08-10T09:30:00+08:00',
    })
    expect(rescheduled.startAt).toBe('2026-08-10T01:30:00.000Z')
    expect(rescheduled.endAt).toBe(created.endAt)

    await service.delete({ id: created.id })
    await expect(service.get({ id: created.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  test('create defaults isAllDay to false and nullable fields to null', async () => {
    const created = await service.create({
      title: uniqueTitle('事件-默认'),
      startAt: '2026-08-10T09:00:00Z',
      endAt: '2026-08-10T10:00:00Z',
    })
    createdEventIds.push(created.id)

    expect(created.isAllDay).toBe(false)
    expect(created.location).toBeNull()
    expect(created.note).toBeNull()
  })

  test('create with an inverted range rejects with 400', async () => {
    await expect(
      service.create({
        title: uniqueTitle('事件-倒挂'),
        startAt: '2026-08-10T10:00:00Z',
        endAt: '2026-08-10T09:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  test('update to an inverted range rejects with 400 and leaves the row unchanged', async () => {
    const created = await service.create({
      title: uniqueTitle('事件-更新倒挂'),
      startAt: '2026-08-10T09:00:00Z',
      endAt: '2026-08-10T10:00:00Z',
    })
    createdEventIds.push(created.id)

    await expect(
      service.update({
        id: created.id,
        endAt: '2026-08-10T08:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })

    const still = await service.get({ id: created.id })
    expect(still.endAt).toBe('2026-08-10T10:00:00.000Z')
  })

  test('getting a missing event rejects with 404', async () => {
    await expect(service.get({ id: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  // ---- Time-range list semantics ------------------------------------------

  test('list returns events overlapping [from, to) ordered by start_at', async () => {
    // within window, fully inside
    const inside = await service.create({
      title: uniqueTitle('事件-窗口'),
      startAt: '2026-08-11T09:00:00Z',
      endAt: '2026-08-11T10:00:00Z',
    })
    createdEventIds.push(inside.id)
    // starts before the window but overlaps it
    const straddlesStart = await service.create({
      title: uniqueTitle('事件-窗口'),
      startAt: '2026-08-11T08:30:00Z',
      endAt: '2026-08-11T09:30:00Z',
    })
    createdEventIds.push(straddlesStart.id)
    // entirely after the window
    const after = await service.create({
      title: uniqueTitle('事件-窗口'),
      startAt: '2026-08-11T11:00:00Z',
      endAt: '2026-08-11T12:00:00Z',
    })
    createdEventIds.push(after.id)
    // entirely before the window
    const before = await service.create({
      title: uniqueTitle('事件-窗口'),
      startAt: '2026-08-11T07:00:00Z',
      endAt: '2026-08-11T08:00:00Z',
    })
    createdEventIds.push(before.id)

    // Force distinct start_at values so ordering is deterministic.
    await db
      .update(eventsTable)
      .set({ startAt: new Date('2026-08-11T08:40:00.000Z') })
      .where(eq(eventsTable.id, straddlesStart.id))
    await db
      .update(eventsTable)
      .set({ startAt: new Date('2026-08-11T09:10:00.000Z') })
      .where(eq(eventsTable.id, inside.id))

    const result = await service.list({
      from: '2026-08-11T08:00:00Z',
      to: '2026-08-11T10:00:00Z',
    })
    const ours = result.filter((e) => e.title.startsWith(titlePrefix('事件-窗口')))
    expect(ours).toHaveLength(2)
    // ordered by start_at ASC
    expect(ours[0].id).toBe(straddlesStart.id)
    expect(ours[1].id).toBe(inside.id)
  })

  test('list rejects an inverted window with 400', async () => {
    await expect(
      service.list({ from: '2026-08-11T10:00:00Z', to: '2026-08-11T08:00:00Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  // ---- List ordering -------------------------------------------------------

  test('event list orders by start_at ASC', async () => {
    const early = await service.create({
      title: uniqueTitle('事件-序'),
      startAt: '2026-08-12T09:00:00Z',
      endAt: '2026-08-12T10:00:00Z',
    })
    const late = await service.create({
      title: uniqueTitle('事件-序'),
      startAt: '2026-08-12T11:00:00Z',
      endAt: '2026-08-12T12:00:00Z',
    })
    createdEventIds.push(early.id, late.id)

    const result = await service.list({
      from: '2026-08-12T00:00:00Z',
      to: '2026-08-13T00:00:00Z',
    })
    const ours = result.filter((e) => e.title.startsWith(titlePrefix('事件-序')))
    expect(ours).toHaveLength(2)
    expect(ours[0].id).toBe(early.id)
    expect(ours[1].id).toBe(late.id)
  })
})
