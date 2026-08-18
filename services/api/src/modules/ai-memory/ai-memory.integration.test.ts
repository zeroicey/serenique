import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { RUN_DB_TESTS, setTestEnv } from '@/test/helpers'

// ---------------------------------------------------------------------------
// AI memory 集成测试 — 真实 PostgreSQL（docker compose test DB, 5433）。
//
// GATED: RUN_DB_TESTS=1，否则整个 suite skip（与其它模块集成测试一致）：
//
//   cd services/api && DATABASE_URL=postgresql://serenique:serenique@127.0.0.1:5433/serenique \
//     RUN_DB_TESTS=1 bun test src/modules/ai-memory/ai-memory.integration.test.ts
//
// 清理：整表单行（id=1），afterAll 复位为空画像；运行期间用 run token 前缀
// 不影响其它数据。
// ---------------------------------------------------------------------------

setTestEnv()

describe.skipIf(!RUN_DB_TESTS)('ai-memory DB integration', () => {
  let service: typeof import('./ai-memory.service').aiMemoryService
  let db: typeof import('@/db/connection').db
  let table: typeof import('./ai-memory.schema').aiMemory

  beforeAll(async () => {
    setTestEnv()
    service = (await import('./ai-memory.service')).aiMemoryService
    db = (await import('@/db/connection')).db
    table = (await import('./ai-memory.schema')).aiMemory
  })

  afterAll(async () => {
    if (!RUN_DB_TESTS) return
    // 复位单行画像（测试不污染用户数据）。
    await db
      .update(table)
      .set({ content: '' })
      .where(undefined as never)
      .catch(() => {})
  })

  test('初始 GET：无记录返回空画像（非 404）', async () => {
    const entry = await service.get()
    expect(entry.id).toBe(1)
    expect(entry.content).toBe('')
  })

  test('PUT 写入后 GET 返回内容，updatedAt 被刷新', async () => {
    const put = await service.upsert({ content: '我叫小序，喜欢喝美式，周末不爱被打扰。' })
    expect(put.content).toBe('我叫小序，喜欢喝美式，周末不爱被打扰。')
    expect(put.updatedAt).toBeTruthy()

    const after = await service.get()
    expect(after.content).toBe(put.content)
    expect(after.updatedAt).toBe(put.updatedAt)
  })

  test('PUT 覆盖（upsert 幂等）：同一条记录内容被替换', async () => {
    await service.upsert({ content: '第一版画像' })
    const second = await service.upsert({ content: '第二版画像' })
    expect(second.content).toBe('第二版画像')

    const rows = await db.select({ id: table.id }).from(table)
    expect(rows).toHaveLength(1) // 单行不膨胀
    expect(rows[0].id).toBe(1)
  })

  test('getUserProfileText：有内容则带 [用户画像] 标题，空则空串', async () => {
    await service.upsert({ content: '我是用户画像内容' })
    const text = await service.getUserProfileText()
    expect(text).toBe('[用户画像]\n我是用户画像内容')

    await service.upsert({ content: '' })
    expect(await service.getUserProfileText()).toBe('')
  })

  test('getUserProfileText 缓存：画像未编辑复用，编辑后刷新', async () => {
    await service.upsert({ content: '缓存版本A' })
    const first = await service.getUserProfileText()
    expect(first).toContain('缓存版本A')

    // 未编辑：直接复用缓存（不重读 DB）
    const second = await service.getUserProfileText()
    expect(second).toBe(first)

    // 编辑后：立即失效并返回新内容
    await service.upsert({ content: '缓存版本B' })
    const third = await service.getUserProfileText()
    expect(third).toContain('缓存版本B')
  })
})
