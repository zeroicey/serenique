import { describe, expect, test } from 'bun:test'
import { setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Task module unit tests — pure functions (task.domain), mappers and Zod
// schemas only. No database needed.
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-05T10:00:00.000Z')
const OLD = new Date('2026-08-04T08:00:00.000Z')

describe('nextCompletedAt — target-status-determined completedAt', () => {
  test('entering done sets completedAt to now', async () => {
    setTestEnv()
    const { nextCompletedAt } = await import('./task.domain')

    expect(nextCompletedAt('done', NOW)).toEqual(NOW)
  })

  test('non-done statuses resolve to null (covers leaving done)', async () => {
    setTestEnv()
    const { nextCompletedAt } = await import('./task.domain')

    expect(nextCompletedAt('todo', NOW)).toBeNull()
    expect(nextCompletedAt('abandon', NOW)).toBeNull()
  })
})

describe('resolveTaskUpdate — combines patch with current row', () => {
  test('entering done writes completedAt = now', async () => {
    setTestEnv()
    const { resolveTaskUpdate } = await import('./task.domain')

    const result = resolveTaskUpdate(
      { title: '写周报', groupId: 'g1', status: 'todo', completedAt: null, dueDate: null },
      { status: 'done' },
      NOW,
    )

    expect(result).toEqual({
      title: '写周报',
      groupId: 'g1',
      status: 'done',
      completedAt: NOW,
      dueDate: null,
    })
  })

  test('leaving done clears completedAt', async () => {
    setTestEnv()
    const { resolveTaskUpdate } = await import('./task.domain')

    const result = resolveTaskUpdate(
      { title: '写周报', groupId: 'g1', status: 'done', completedAt: OLD, dueDate: null },
      { status: 'todo' },
      NOW,
    )

    expect(result.status).toBe('todo')
    expect(result.completedAt).toBeNull()
  })

  test('staying done (status not in patch) keeps completedAt unchanged', async () => {
    setTestEnv()
    const { resolveTaskUpdate } = await import('./task.domain')

    const result = resolveTaskUpdate(
      { title: '写周报', groupId: 'g1', status: 'done', completedAt: OLD, dueDate: null },
      { title: '写周报（终稿）' },
      NOW,
    )

    expect(result.title).toBe('写周报（终稿）')
    expect(result.status).toBe('done')
    expect(result.completedAt).toEqual(OLD)
  })

  test('re-completing an already-done task refreshes completedAt', async () => {
    setTestEnv()
    const { resolveTaskUpdate } = await import('./task.domain')

    const result = resolveTaskUpdate(
      { title: '写周报', groupId: 'g1', status: 'done', completedAt: OLD, dueDate: null },
      { status: 'done' },
      NOW,
    )

    expect(result.completedAt).toEqual(NOW)
  })

  test('combines title/groupId changes alongside a status change', async () => {
    setTestEnv()
    const { resolveTaskUpdate } = await import('./task.domain')

    const result = resolveTaskUpdate(
      { title: '写周报', groupId: 'g1', status: 'todo', completedAt: null, dueDate: null },
      { title: '写周报（终稿）', groupId: 'g2', status: 'done' },
      NOW,
    )

    expect(result).toEqual({
      title: '写周报（终稿）',
      groupId: 'g2',
      status: 'done',
      completedAt: NOW,
      dueDate: null,
    })
  })
})

describe('task zod schemas', () => {
  test('CreateTaskSchema accepts valid payload and defaults status to todo', async () => {
    setTestEnv()
    const { CreateTaskSchema } = await import('./task.types')

    expect(
      CreateTaskSchema.safeParse({
        title: '写周报',
        groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      }).success,
    ).toBe(true)
    const parsed = CreateTaskSchema.parse({
      title: '写周报',
      groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
    })
    expect(parsed.status).toBe('todo')
  })

  test('CreateTaskSchema rejects invalid status values', async () => {
    setTestEnv()
    const { CreateTaskSchema } = await import('./task.types')

    const parsed = CreateTaskSchema.safeParse({
      title: '写周报',
      groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      status: 'in_progress',
    })
    expect(parsed.success).toBe(false)
  })

  test('CreateTaskSchema enforces title bounds', async () => {
    setTestEnv()
    const { CreateTaskSchema } = await import('./task.types')

    expect(
      CreateTaskSchema.safeParse({
        title: '',
        groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      }).success,
    ).toBe(false)
    expect(
      CreateTaskSchema.safeParse({
        title: 'x'.repeat(201),
        groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      }).success,
    ).toBe(false)
    expect(
      CreateTaskSchema.safeParse({
        title: 'x'.repeat(200),
        groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      }).success,
    ).toBe(true)
  })

  test('CreateTaskSchema rejects whitespace-only title', async () => {
    setTestEnv()
    const { CreateTaskSchema } = await import('./task.types')

    expect(
      CreateTaskSchema.safeParse({
        title: '   ',
        groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      }).success,
    ).toBe(false)
  })

  test('CreateTaskSchema rejects non-uuid groupId', async () => {
    setTestEnv()
    const { CreateTaskSchema } = await import('./task.types')

    expect(CreateTaskSchema.safeParse({ title: '写周报', groupId: 'not-a-uuid' }).success).toBe(
      false,
    )
  })

  test('UpdateTaskSchema requires at least one field', async () => {
    setTestEnv()
    const { UpdateTaskSchema } = await import('./task.types')

    expect(UpdateTaskSchema.safeParse({}).success).toBe(false)
    expect(UpdateTaskSchema.safeParse({ title: '新标题' }).success).toBe(true)
    expect(UpdateTaskSchema.safeParse({ status: 'abandon' }).success).toBe(true)
  })

  test('ListTaskSchema coerces page/pageSize and accepts optional filters', async () => {
    setTestEnv()
    const { ListTaskSchema } = await import('./task.types')

    const parsed = ListTaskSchema.parse({
      page: '2',
      pageSize: '20',
      groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      status: 'done',
    })
    expect(parsed).toMatchObject({ page: 2, pageSize: 20, status: 'done' })
  })

  test('CreateTaskGroupSchema enforces title bounds', async () => {
    setTestEnv()
    const { CreateTaskGroupSchema } = await import('./task.types')

    expect(CreateTaskGroupSchema.safeParse({ title: '' }).success).toBe(false)
    expect(CreateTaskGroupSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(CreateTaskGroupSchema.safeParse({ title: '工作' }).success).toBe(true)
  })
})

describe('task mappers', () => {
  test('toTaskEntry converts a row to an entry with ISO timestamps', async () => {
    setTestEnv()
    const { toTaskEntry } = await import('./task.mappers')
    const { fakeTaskRow } = await import('@/test/helpers')

    expect(toTaskEntry(fakeTaskRow())).toEqual({
      id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3002',
      groupId: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      title: '测试任务',
      status: 'todo',
      dueDate: null,
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
      completedAt: null,
    })

    const done = toTaskEntry(
      fakeTaskRow({
        status: 'done',
        completedAt: new Date('2026-08-05T13:00:00.000Z'),
      }),
    )
    expect(done.status).toBe('done')
    expect(done.completedAt).toBe('2026-08-05T13:00:00.000Z')
  })

  test('toTaskGroupEntry converts a group row to an entry', async () => {
    setTestEnv()
    const { toTaskGroupEntry } = await import('./task.mappers')
    const { fakeTaskGroupRow } = await import('@/test/helpers')

    expect(toTaskGroupEntry(fakeTaskGroupRow())).toEqual({
      id: '0198f6d0-9e7c-71d7-8214-2a0f7f5f3001',
      title: '测试任务组',
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
    })
  })
})

describe('DueDateSchema — YYYY-MM-DD validation', () => {
  test('accepts valid dates, rejects bad formats', async () => {
    setTestEnv()
    const { DueDateSchema } = await import('./task.types')

    expect(DueDateSchema.parse('2026-08-09')).toBe('2026-08-09')
    expect(() => DueDateSchema.parse('2026/08/09')).toThrow()
    expect(() => DueDateSchema.parse('2026-8-9')).toThrow()
    expect(() => DueDateSchema.parse('2026-02-30')).toThrow() // invalid calendar day
    expect(() => DueDateSchema.parse('2026-13-01')).toThrow()
  })
})

describe('UpdateTaskSchema dueDate — clear semantics', () => {
  test("null clears, '' normalizes to null, valid string passes, absent keeps", async () => {
    setTestEnv()
    const { UpdateTaskSchema } = await import('./task.types')

    expect(UpdateTaskSchema.parse({ dueDate: null })).toEqual({ dueDate: null })
    expect(UpdateTaskSchema.parse({ dueDate: '' })).toEqual({ dueDate: null })
    expect(UpdateTaskSchema.parse({ dueDate: '2026-08-09' })).toEqual({ dueDate: '2026-08-09' })
    // dueDate alone satisfies the "at least one field" refine
    expect(UpdateTaskSchema.parse({ dueDate: null }).dueDate).toBeNull()
  })
})

describe('resolveTaskUpdate — dueDate resolution', () => {
  test('absent patch keeps current; null clears; string sets', async () => {
    setTestEnv()
    const { resolveTaskUpdate } = await import('./task.domain')

    const row = {
      title: 't',
      groupId: 'g',
      status: 'todo',
      completedAt: null,
      dueDate: '2026-08-09',
    } as const
    expect(resolveTaskUpdate(row, {}, NOW).dueDate).toBe('2026-08-09')
    expect(resolveTaskUpdate(row, { dueDate: null }, NOW).dueDate).toBeNull()
    expect(resolveTaskUpdate(row, { dueDate: '2026-09-01' }, NOW).dueDate).toBe('2026-09-01')
  })
})
