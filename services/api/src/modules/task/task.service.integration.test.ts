import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { RUN_DB_TESTS, setTestEnv, titlePrefix, uniqueTitle } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Task service integration tests — exercise the real service + Drizzle ORM
// against PostgreSQL (docker compose test DB, see docker-compose.test.yml).
//
// GATED: the whole suite is skipped unless RUN_DB_TESTS=1 is set, so plain
// `bun test` stays green when the database is not running. One-shot run:
//
//   cd services/api && bun run test:integration:full
//
// Cleanup: every task group created here is tracked and deleted in afterAll
// (deleting a group cascades to its tasks at the DB level, so no task rows are
// left behind either). Titles carry a run-unique token so list assertions
// never collide with pre-existing data in the shared local database.
// ---------------------------------------------------------------------------

setTestEnv()

const createdGroupIds: string[] = []

describe.skipIf(!RUN_DB_TESTS)('task service DB integration', () => {
  let service: typeof import('./task.service').taskService
  let db: typeof import('@/db/connection').db
  let tasksTable: typeof import('./task.schema').tasks
  let taskGroupsTable: typeof import('./task.schema').taskGroups

  beforeAll(async () => {
    setTestEnv()
    service = (await import('./task.service')).taskService
    db = (await import('@/db/connection')).db
    tasksTable = (await import('./task.schema')).tasks
    taskGroupsTable = (await import('./task.schema')).taskGroups
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS || createdGroupIds.length === 0) return
    // Deleting a group cascades to its tasks at the DB level (ON DELETE CASCADE).
    // Note: the shared connection pool is intentionally NOT closed here — bun
    // test runs every file in one process, so closing it would break later
    // integration files. The process exits and releases the pool.
    await db.delete(taskGroupsTable).where(inArray(taskGroupsTable.id, createdGroupIds))
  })

  // ---- Task group CRUD -----------------------------------------------------

  test('task group create / get / rename', async () => {
    const created = await service.createTaskGroup({ title: uniqueTitle('组-crud') })
    createdGroupIds.push(created.id)

    expect(created.id).toBeTruthy()
    expect(created.title).toContain(titlePrefix('组-crud'))
    expect(created.createdAt).toBeTruthy()
    expect(created.updatedAt).toBeTruthy()

    const got = await service.getTaskGroup({ id: created.id })
    expect(got.id).toBe(created.id)
    expect(got.title).toBe(created.title)

    const renamedTitle = uniqueTitle('组-crud-改名')
    const renamed = await service.updateTaskGroup({
      id: created.id,
      title: renamedTitle,
    })
    expect(renamed.id).toBe(created.id)
    expect(renamed.title).toBe(renamedTitle)

    const gotAfter = await service.getTaskGroup({ id: created.id })
    expect(gotAfter.title).toBe(renamedTitle)
  })

  test('task group list orders by updated_at DESC', async () => {
    const older = await service.createTaskGroup({ title: uniqueTitle('组-序') })
    const newer = await service.createTaskGroup({ title: uniqueTitle('组-序') })
    createdGroupIds.push(older.id, newer.id)

    // Bump `newer`'s updated_at so it is deterministically the most recent.
    await service.updateTaskGroup({ id: newer.id, title: uniqueTitle('组-序') })

    const result = await service.listTaskGroups({ page: 1, pageSize: 50 })
    const ours = result.items.filter((g) => g.title.startsWith(titlePrefix('组-序')))
    expect(ours).toHaveLength(2)
    expect(ours[0].id).toBe(newer.id)
    expect(ours[1].id).toBe(older.id)
  })

  test('getting a missing task group rejects with 404', async () => {
    await expect(service.getTaskGroup({ id: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  // ---- Task create ---------------------------------------------------------

  test('create task defaults to status todo with completedAt null', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-默认') })
    createdGroupIds.push(group.id)

    const task = await service.createTask({
      title: uniqueTitle('任务-默认'),
      groupId: group.id,
    })

    expect(task.status).toBe('todo')
    expect(task.completedAt).toBeNull()
    expect(task.groupId).toBe(group.id)
    expect(task.title).toContain('任务-')
  })

  test('create task with explicit status done writes completedAt', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-完成') })
    createdGroupIds.push(group.id)

    const task = await service.createTask({
      title: uniqueTitle('任务-完成'),
      groupId: group.id,
      status: 'done',
    })

    expect(task.status).toBe('done')
    expect(task.completedAt).not.toBeNull()
  })

  test('create task in a non-existent group rejects with 404', async () => {
    await expect(
      service.createTask({ title: uniqueTitle('任务-悬空'), groupId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  // ---- Task update / status↔completedAt sync ------------------------------

  test('updateTask syncs completedAt on status changes and keeps it on title-only edits', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-更新') })
    createdGroupIds.push(group.id)
    const task = await service.createTask({
      title: uniqueTitle('任务-更新'),
      groupId: group.id,
    })
    expect(task.completedAt).toBeNull()

    // entering done → completedAt written
    const done = await service.updateTask({ id: task.id, status: 'done' })
    expect(done.status).toBe('done')
    expect(done.completedAt).not.toBeNull()
    const completedAtWhenDone = done.completedAt

    // leaving done (→ todo) → completedAt cleared
    const todo = await service.updateTask({ id: task.id, status: 'todo' })
    expect(todo.status).toBe('todo')
    expect(todo.completedAt).toBeNull()

    // re-entering done → completedAt refreshed (non-null)
    const doneAgain = await service.updateTask({ id: task.id, status: 'done' })
    expect(doneAgain.completedAt).not.toBeNull()

    // title-only edit while staying done → completedAt unchanged
    const newTitle = uniqueTitle('任务-更新-标题')
    const titleOnly = await service.updateTask({ id: task.id, title: newTitle })
    expect(titleOnly.status).toBe('done')
    expect(titleOnly.title).toBe(newTitle)
    expect(titleOnly.completedAt).toBe(doneAgain.completedAt)

    // persisted state visible via getTask
    const got = await service.getTask({ id: task.id })
    expect(got.title).toBe(newTitle)
    expect(got.status).toBe('done')
    expect(got.completedAt).toBe(doneAgain.completedAt)

    // sanity: the initial "done" timestamp was also real
    expect(completedAtWhenDone).not.toBeNull()
  })

  test('move task to a non-existent group rejects with 404 and leaves it unchanged', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-移动') })
    createdGroupIds.push(group.id)
    const task = await service.createTask({
      title: uniqueTitle('任务-移动'),
      groupId: group.id,
    })

    await expect(service.updateTask({ id: task.id, groupId: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })

    const still = await service.getTask({ id: task.id })
    expect(still.groupId).toBe(group.id)
  })

  test('move task to an existing group succeeds', async () => {
    const from = await service.createTaskGroup({ title: uniqueTitle('组-移出') })
    const to = await service.createTaskGroup({ title: uniqueTitle('组-移入') })
    createdGroupIds.push(from.id, to.id)
    const task = await service.createTask({
      title: uniqueTitle('任务-搬家'),
      groupId: from.id,
    })

    const moved = await service.updateTask({ id: task.id, groupId: to.id })
    expect(moved.groupId).toBe(to.id)
  })

  // ---- Cascade delete ------------------------------------------------------

  test('deleting a task group cascades to its tasks', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-级联') })
    const t1 = await service.createTask({ title: uniqueTitle('任务-级联-1'), groupId: group.id })
    const t2 = await service.createTask({ title: uniqueTitle('任务-级联-2'), groupId: group.id })

    await service.deleteTaskGroup({ id: group.id })

    await expect(service.getTaskGroup({ id: group.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })

    const remaining = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(inArray(tasksTable.id, [t1.id, t2.id]))
    expect(remaining).toHaveLength(0)
  })

  // ---- List filtering + pagination -----------------------------------------

  test('list tasks filters by groupId/status and reports correct totals', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-过滤') })
    createdGroupIds.push(group.id)

    const statuses: Array<'todo' | 'done'> = ['todo', 'todo', 'done', 'todo', 'done']
    for (const status of statuses) {
      await service.createTask({
        title: uniqueTitle('任务-过滤'),
        groupId: group.id,
        status,
      })
    }

    // Unfiltered within the group → all 5.
    const all = await service.listTasks({ page: 1, pageSize: 10, groupId: group.id })
    expect(all.total).toBe(5)
    expect(all.items).toHaveLength(5)

    // Pagination keeps the total but limits the page.
    const page = await service.listTasks({ page: 1, pageSize: 2, groupId: group.id })
    expect(page.total).toBe(5)
    expect(page.items).toHaveLength(2)

    // Filtered by status → only matching rows, correct filtered total.
    const done = await service.listTasks({
      page: 1,
      pageSize: 10,
      groupId: group.id,
      status: 'done',
    })
    expect(done.total).toBe(2)
    expect(done.items).toHaveLength(2)
    expect(done.items.every((t) => t.status === 'done')).toBe(true)

    const todo = await service.listTasks({
      page: 1,
      pageSize: 10,
      groupId: group.id,
      status: 'todo',
    })
    expect(todo.total).toBe(3)
    expect(todo.items.every((t) => t.status === 'todo')).toBe(true)
  })

  // ---- List ordering -------------------------------------------------------

  test('task list orders by created_at DESC', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-任务序') })
    createdGroupIds.push(group.id)

    const older = await service.createTask({
      title: uniqueTitle('任务-序-旧'),
      groupId: group.id,
    })
    const newer = await service.createTask({
      title: uniqueTitle('任务-序-新'),
      groupId: group.id,
    })

    // Force distinct created_at values so ordering is deterministic regardless
    // of how quickly the two inserts land in the same microsecond.
    await db
      .update(tasksTable)
      .set({ createdAt: new Date('2026-08-04T12:00:00.000Z') })
      .where(eq(tasksTable.id, older.id))
    await db
      .update(tasksTable)
      .set({ createdAt: new Date('2026-08-05T12:00:00.000Z') })
      .where(eq(tasksTable.id, newer.id))

    const result = await service.listTasks({ page: 1, pageSize: 10, groupId: group.id })
    expect(result.total).toBe(2)
    expect(result.items[0].id).toBe(newer.id)
    expect(result.items[1].id).toBe(older.id)
  })

  // ---- dueDate persistence + range filtering -------------------------------

  test('create with dueDate persists; update clears it with null', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-截止') })
    createdGroupIds.push(group.id)
    const task = await service.createTask({
      groupId: group.id,
      title: uniqueTitle('任务-截止'),
      dueDate: '2026-08-20',
    })
    expect(task.dueDate).toBe('2026-08-20')

    const cleared = await service.updateTask({ id: task.id, dueDate: null })
    expect(cleared.dueDate).toBeNull()

    const reset = await service.updateTask({ id: task.id, dueDate: '2026-08-21' })
    expect(reset.dueDate).toBe('2026-08-21')
  })

  test('list filters by inclusive dueDateFrom/dueDateTo and sorts by dueDate asc', async () => {
    const group = await service.createTaskGroup({ title: uniqueTitle('组-截止过滤') })
    createdGroupIds.push(group.id)
    await service.createTask({ groupId: group.id, title: '过期', dueDate: '2026-08-01' })
    await service.createTask({ groupId: group.id, title: '中间', dueDate: '2026-08-15' })
    await service.createTask({ groupId: group.id, title: '未来', dueDate: '2026-09-01' })
    await service.createTask({ groupId: group.id, title: '无日期' })

    const inRange = await service.listTasks({
      page: 1,
      pageSize: 50,
      groupId: group.id,
      status: 'todo',
      dueDateFrom: '2026-08-01',
      dueDateTo: '2026-08-31',
    })
    expect(inRange.items.map((t) => t.title)).toEqual(['过期', '中间'])

    const combined = await service.listTasks({
      page: 1,
      pageSize: 50,
      groupId: group.id,
      status: 'todo',
      dueDateTo: '2026-08-01',
    })
    expect(combined.items.map((t) => t.title)).toEqual(['过期'])
    expect(combined.total).toBe(1)
  })
})
