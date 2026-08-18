import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// AI memory module — 用户画像（L2）单行存储。
//
// 单行设计：id 恒为 AI_MEMORY_SINGLETON_ID(=1)，upsert 语义（PUT 覆盖）。
// content 为用户自维护的「自我介绍/偏好/背景」（≤2048 字符，Zod + DB 双层
// 约束不额外加 check——长度在上层校验即可，text 类型无 DB 限制）。
// 变更检测：updatedAt 随写入刷新，ai.service 的 L2 段按它缓存（编辑才重读）。
// ---------------------------------------------------------------------------

export const aiMemory = pgTable('ai_memory', {
  id: integer('id').primaryKey(),
  content: text('content').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export type AiMemoryRow = typeof aiMemory.$inferSelect
