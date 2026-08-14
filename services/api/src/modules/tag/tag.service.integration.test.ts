import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { and, count, eq, inArray } from 'drizzle-orm'
import { RUN_DB_TESTS, setTestEnv, titlePrefix, uniqueTitle } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Tag service integration tests — exercise the real service + Drizzle ORM
// against PostgreSQL (docker compose test DB, see docker-compose.test.yml).
//
// GATED: the whole suite is skipped unless RUN_DB_TESTS=1 is set, so plain
// `bun test` stays green when the database is not running. One-shot run:
//
//   cd services/api && bun run test:integration:full
//
// Cleanup: created tags are tracked and deleted in afterAll (deleting a tag
// cascades to its relations at the DB level); moments are deleted through the
// moment service so their relations are cleaned too. All names/texts carry a
// run-unique token so assertions never collide with pre-existing data.
// ---------------------------------------------------------------------------

setTestEnv()

const createdTagIds: string[] = []
const createdMomentIds: string[] = []

describe.skipIf(!RUN_DB_TESTS)('tag service DB integration', () => {
  let service: typeof import('./tag.service').tagService
  let momentService: typeof import('@/modules/moment/moment.service').momentService
  let db: typeof import('@/db/connection').db
  let tagsTable: typeof import('./tag.schema').tags
  let relationsTable: typeof import('./tag.schema').tagRelations
  let momentsTable: typeof import('@/modules/moment/moment.schema').moments

  beforeAll(async () => {
    setTestEnv()
    service = (await import('./tag.service')).tagService
    momentService = (await import('@/modules/moment/moment.service')).momentService
    db = (await import('@/db/connection')).db
    tagsTable = (await import('./tag.schema')).tags
    relationsTable = (await import('./tag.schema')).tagRelations
    momentsTable = (await import('@/modules/moment/moment.schema')).moments
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS) return
    // Moments first (their relations are cleaned in the service tx), then
    // tags (cascade removes any remaining relations). The shared connection
    // pool is intentionally NOT closed here — bun test runs every file in
    // one process, so closing it would break later integration files.
    if (createdMomentIds.length > 0) {
      await db.delete(momentsTable).where(inArray(momentsTable.id, createdMomentIds))
    }
    if (createdTagIds.length > 0) {
      await db.delete(tagsTable).where(inArray(tagsTable.id, createdTagIds))
    }
  })

  /** Create a run-unique tag and track it for cleanup. */
  async function createTag(name?: string) {
    const tag = await service.create({ name: name ?? uniqueTitle('标签') })
    createdTagIds.push(tag.id)
    return tag
  }

  /** Create a run-unique moment and track it for cleanup. */
  async function createMoment() {
    const moment = await momentService.create({ text: uniqueTitle('闪念-标签') })
    createdMomentIds.push(moment.id)
    return moment
  }

  async function relationCountFor(tagId: string, ownerId: string) {
    const rows = await db
      .select({ n: count() })
      .from(relationsTable)
      .where(
        and(
          eq(relationsTable.tagId, tagId),
          eq(relationsTable.ownerType, 'moment'),
          eq(relationsTable.ownerId, ownerId),
        ),
      )
    return rows[0]?.n ?? 0
  }

  // ---- Tag CRUD -----------------------------------------------------------

  test('create / get / list with momentCount', async () => {
    const tag = await createTag()
    expect(tag.id).toBeTruthy()
    expect(tag.name).toContain(titlePrefix('标签'))
    expect(tag.momentCount).toBe(0)

    const got = await service.get({ id: tag.id })
    expect(got.id).toBe(tag.id)
    expect(got.name).toBe(tag.name)

    const listed = await service.list({ page: 1, pageSize: 50 })
    expect(listed.total).toBeGreaterThanOrEqual(1)
    const ours = listed.items.find((t) => t.id === tag.id)
    expect(ours).toBeDefined()
    expect(ours!.momentCount).toBe(0)
  })

  test('name is normalized (trim + lowercase) at creation', async () => {
    const tag = await createTag('  WorkTag  ')
    expect(tag.name).toBe('worktag')
  })

  test('duplicate name creation rejects with 409 CONFLICT', async () => {
    const tag = await createTag('唯一-重名')
    await expect(service.create({ name: tag.name })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    // Case-insensitive collision too (normalized before the DB check).
    await expect(service.create({ name: tag.name.toUpperCase() })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
  })

  test('rename updates the name; rename to an existing name rejects 409', async () => {
    const a = await createTag('改名-甲')
    const b = await createTag('改名-乙')

    const renamed = await service.rename({ id: a.id, name: ' 改名-丙 ' })
    expect(renamed.name).toBe('改名-丙')
    expect(renamed.id).toBe(a.id)

    await expect(service.rename({ id: a.id, name: b.name })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    await expect(service.rename({ id: randomUUID(), name: '改名-新' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  test('renaming keeps existing relations (they hang off tag_id)', async () => {
    const tag = await createTag('改名-关系')
    const moment = await createMoment()
    await service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: moment.id })

    await service.rename({ id: tag.id, name: '改名-关系-新' })

    const got = await momentService.get({ id: moment.id })
    expect(got.tags.map((t) => t.id)).toEqual([tag.id])
    expect(got.tags[0].name).toBe('改名-关系-新')
  })

  test('getting a missing tag rejects with 404', async () => {
    await expect(service.get({ id: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  // ---- Attach / detach ----------------------------------------------------

  test('attach binds a tag to a moment; duplicate attach rejects 409', async () => {
    const tag = await createTag('绑定')
    const moment = await createMoment()

    const relation = await service.attach({
      tagId: tag.id,
      ownerType: 'moment',
      ownerId: moment.id,
    })
    expect(relation.tagId).toBe(tag.id)
    expect(relation.ownerType).toBe('moment')
    expect(relation.ownerId).toBe(moment.id)

    await expect(
      service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: moment.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })

    expect(await relationCountFor(tag.id, moment.id)).toBe(1)
  })

  test('attach to a missing owner rejects 404; unregistered ownerType rejects 400', async () => {
    const tag = await createTag('绑定-校验')

    await expect(
      service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    await expect(
      service.attach({
        tagId: tag.id,
        ownerType: 'diary',
        ownerId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
  })

  test('attach a missing tag rejects 404', async () => {
    const moment = await createMoment()
    await expect(
      service.attach({ tagId: randomUUID(), ownerType: 'moment', ownerId: moment.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  test('detach removes the binding; detaching a missing binding rejects 404', async () => {
    const tag = await createTag('解绑')
    const moment = await createMoment()
    await service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: moment.id })

    const result = await service.detach({ tagId: tag.id, ownerType: 'moment', ownerId: moment.id })
    expect(result.id).toBeTruthy()
    expect(await relationCountFor(tag.id, moment.id)).toBe(0)

    await expect(
      service.detach({ tagId: tag.id, ownerType: 'moment', ownerId: moment.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  // ---- PUT replace (idempotent set semantics) ------------------------------

  test('replaceForOwner sets the exact tag set, tolerating already-bound tags', async () => {
    const t1 = await createTag('替换-1')
    const t2 = await createTag('替换-2')
    const t3 = await createTag('替换-3')
    const moment = await createMoment()

    // Initial replace: [t1, t2]
    const initial = await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t1.id, t2.id],
    })
    expect(initial.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort())
    expect(initial.every((t) => t.momentCount >= 1)).toBe(true)

    // Idempotent re-replace of the same set — tolerated, not a 409.
    const same = await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t1.id, t2.id],
    })
    expect(same.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort())

    // Swap: drop t1, add t3.
    const swapped = await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t2.id, t3.id],
    })
    expect(swapped.map((t) => t.id).sort()).toEqual([t2.id, t3.id].sort())

    const got = await momentService.get({ id: moment.id })
    expect(got.tags.map((t) => t.id).sort()).toEqual([t2.id, t3.id].sort())
  })

  test('replaceForOwner dedupes duplicate ids in the request', async () => {
    const t1 = await createTag('替换-去重')
    const moment = await createMoment()

    const replaced = await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t1.id, t1.id, t1.id],
    })
    expect(replaced.map((t) => t.id)).toEqual([t1.id])
    expect(await relationCountFor(t1.id, moment.id)).toBe(1)
  })

  test('replaceForOwner with an empty array clears all relations', async () => {
    const t1 = await createTag('替换-清空')
    const moment = await createMoment()
    await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t1.id],
    })

    const cleared = await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [],
    })
    expect(cleared).toEqual([])

    const got = await momentService.get({ id: moment.id })
    expect(got.tags).toEqual([])
  })

  test('replaceForOwner with a missing tagId rejects 404 and rolls back', async () => {
    const t1 = await createTag('替换-回滚')
    const t2 = await createTag('替换-回滚-2')
    const moment = await createMoment()
    await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t1.id],
    })

    await expect(
      service.replaceForOwner({
        ownerType: 'moment',
        ownerId: moment.id,
        tagIds: [t2.id, randomUUID()],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    // Nothing changed: t1 still bound, t2 not.
    const got = await momentService.get({ id: moment.id })
    expect(got.tags.map((t) => t.id)).toEqual([t1.id])
    expect(await relationCountFor(t2.id, moment.id)).toBe(0)
  })

  test('replaceForOwner on a missing owner rejects 404', async () => {
    const t1 = await createTag('替换-悬空')
    await expect(
      service.replaceForOwner({
        ownerType: 'moment',
        ownerId: randomUUID(),
        tagIds: [t1.id],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  // ---- Cascade / cleanup semantics ----------------------------------------

  test('deleting a tag cascades its relations (moment keeps other tags)', async () => {
    const t1 = await createTag('级联-1')
    const t2 = await createTag('级联-2')
    const moment = await createMoment()
    await service.replaceForOwner({
      ownerType: 'moment',
      ownerId: moment.id,
      tagIds: [t1.id, t2.id],
    })

    await service.delete({ id: t1.id })
    createdTagIds.splice(createdTagIds.indexOf(t1.id), 1)

    expect(await relationCountFor(t1.id, moment.id)).toBe(0)
    const got = await momentService.get({ id: moment.id })
    expect(got.tags.map((t) => t.id)).toEqual([t2.id])
  })

  test('deleting a moment cleans its relations; the tag survives', async () => {
    const tag = await createTag('闪念删除')
    const moment = await createMoment()
    await service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: moment.id })

    await momentService.delete({ id: moment.id })
    createdMomentIds.splice(createdMomentIds.indexOf(moment.id), 1)

    // Tag still exists and is fully unbound.
    const got = await service.get({ id: tag.id })
    expect(got.name).toBe(tag.name)
    expect(got.momentCount).toBe(0)
  })

  test('deleting a missing tag rejects 404', async () => {
    await expect(service.delete({ id: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  // ---- Moment integration -------------------------------------------------

  test('moment create with inline tags binds them in the same transaction', async () => {
    const t1 = await createTag('内联-1')
    const t2 = await createTag('内联-2')
    const moment = await momentService.create({
      text: uniqueTitle('闪念-内联'),
      tags: [t1.id, t2.id, t1.id], // duplicates deduped
    })
    createdMomentIds.push(moment.id)

    expect(moment.tags.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort())
    expect(moment.tags.every((t) => t.momentCount >= 1)).toBe(true)

    const got = await momentService.get({ id: moment.id })
    expect(got.tags.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort())
  })

  test('moment create with a missing inline tag rejects 404 and rolls back', async () => {
    const before = (await momentService.list({ page: 1, pageSize: 50 })).total

    await expect(
      momentService.create({ text: uniqueTitle('闪念-内联失败'), tags: [randomUUID()] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    // The moment insert was rolled back with the failed tag resolution.
    const after = (await momentService.list({ page: 1, pageSize: 50 })).total
    expect(after).toBe(before)
  })

  test('moment list embeds tags and filters by ?tag= with correct totals', async () => {
    const tagA = await createTag('过滤-A')
    const tagB = await createTag('过滤-B')

    const m1 = await createMoment() // no tags
    await momentService.addTag(m1.id, tagA.id)
    await momentService.addTag(m1.id, tagB.id)
    const m2 = await createMoment()
    await momentService.addTag(m2.id, tagA.id)
    await createMoment() // no tags

    // Unfiltered list embeds tags[] for every moment.
    const all = await momentService.list({ page: 1, pageSize: 50 })
    const m1Listed = all.items.find((m) => m.id === m1.id)!
    expect(m1Listed.tags.map((t) => t.id).sort()).toEqual([tagA.id, tagB.id].sort())

    // Filter by tagA → only m1 and m2 (m1 has both).
    const filtered = await momentService.list({ page: 1, pageSize: 50, tag: tagA.id })
    expect(filtered.total).toBe(2)
    expect(filtered.items.map((m) => m.id).sort()).toEqual([m1.id, m2.id].sort())

    // Filter by tagB → only m1.
    const filteredB = await momentService.list({ page: 1, pageSize: 50, tag: tagB.id })
    expect(filteredB.total).toBe(1)
    expect(filteredB.items[0].id).toBe(m1.id)

    // Pagination respects the filtered total.
    const page = await momentService.list({ page: 1, pageSize: 1, tag: tagA.id })
    expect(page.total).toBe(2)
    expect(page.items).toHaveLength(1)

    // Unknown tag → empty result, total 0.
    const empty = await momentService.list({ page: 1, pageSize: 50, tag: randomUUID() })
    expect(empty.total).toBe(0)
    expect(empty.items).toHaveLength(0)
  })

  test('moment nested addTag / removeTag / replaceTags roundtrip', async () => {
    const t1 = await createTag('嵌套-1')
    const t2 = await createTag('嵌套-2')
    const moment = await createMoment()

    // addTag (201 semantics via service)
    const relation = await momentService.addTag(moment.id, t1.id)
    expect(relation.tagId).toBe(t1.id)
    await expect(momentService.addTag(moment.id, t1.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })

    // replaceTags
    const replaced = await momentService.replaceTags(moment.id, [t1.id, t2.id])
    expect(replaced.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort())

    // removeTag
    await momentService.removeTag(moment.id, t1.id)
    await expect(momentService.removeTag(moment.id, t1.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })

    const got = await momentService.get({ id: moment.id })
    expect(got.tags.map((t) => t.id)).toEqual([t2.id])
  })

  test('moment update keeps embedded tags intact', async () => {
    const tag = await createTag('更新-标签')
    const moment = await createMoment()
    await momentService.addTag(moment.id, tag.id)

    const updated = await momentService.update({
      id: moment.id,
      text: uniqueTitle('闪念-更新标签'),
    })
    expect(updated.tags.map((t) => t.id)).toEqual([tag.id])
  })

  test('tag list reports momentCount reflecting current bindings', async () => {
    const tag = await createTag('计数')
    const m1 = await createMoment()
    const m2 = await createMoment()
    await service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: m1.id })
    await service.attach({ tagId: tag.id, ownerType: 'moment', ownerId: m2.id })

    expect((await service.get({ id: tag.id })).momentCount).toBe(2)

    const listed = await service.list({ page: 1, pageSize: 50 })
    expect(listed.items.find((t) => t.id === tag.id)!.momentCount).toBe(2)
  })
})
