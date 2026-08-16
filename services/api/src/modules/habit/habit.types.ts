import { z } from 'zod'
import type { DailyStatus, HabitKind } from '@/modules/habit/habit.schema'

// ---------------------------------------------------------------------------
// Habit module — request/response types
// ---------------------------------------------------------------------------

export const HabitKindSchema = z.enum(['good', 'bad'])
export const DailyStatusSchema = z.enum(['done', 'not_done'])

/** YYYY-MM-DD 日期。存储为 text（见计划全局约束），字符串可直接字典序比较。 */
export const DailyDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
  .refine((v) => {
    const parsed = Date.parse(`${v}T00:00:00Z`)
    // 部分引擎会把越界日期（如 2026-02-30）归一化而非返回 NaN，
    // 用往返校验兜底，确保是真实存在的日历日期。
    return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === v
  }, '日期无效')

/** 可选简介：≤500 字符，trim；空串归一化为 null（清除）。 */
const DescriptionSchema = z
  .union([z.string().trim().max(500), z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const CreateHabitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: HabitKindSchema,
  countable: z.boolean().default(false),
  description: DescriptionSchema,
})

export const UpdateHabitSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    kind: HabitKindSchema.optional(),
    countable: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    // null 显式清除，"" 归一为 null，缺省保持不变。
    description: DescriptionSchema,
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.kind !== undefined ||
      v.countable !== undefined ||
      v.sortOrder !== undefined ||
      v.description !== undefined,
    '至少需要提供一个待更新字段',
  )

export const SetDailySchema = z
  .object({
    // 做没做型：'done' | 'not_done' | null（null 清除回未记录）。
    // 计数型不可传 status（service 按 countable 校验）。
    status: DailyStatusSchema.nullable().optional(),
    // 计数型：次数 ≥0。做没做型不可传 count（service 按 countable 校验）。
    count: z.number().int().min(0).optional(),
  })
  .refine((v) => v.status !== undefined || v.count !== undefined, '至少需要提供一个待更新字段')

export const ListDailySchema = z.object({
  date: DailyDateSchema,
})

export const OverviewSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
})

// ---- Input types (service layer) ------------------------------------------
// z.input keeps defaulted fields optional so consumers can pass bare objects.

export type CreateHabitInput = z.input<typeof CreateHabitSchema>
export type UpdateHabitInput = { id: string } & z.input<typeof UpdateHabitSchema>
export type DeleteHabitInput = { id: string }
export type ListDailyInput = z.infer<typeof ListDailySchema>
export type SetDailyInput = { habitId: string; date: string } & z.input<typeof SetDailySchema>
export type ClearDailyInput = { habitId: string; date: string }
export type OverviewInput = z.infer<typeof OverviewSchema>

// ---- Entry types (response layer) — times are ISO strings -----------------

export type HabitEntry = {
  id: string
  name: string
  description: string | null
  kind: HabitKind
  countable: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type DailyEntry = {
  habitId: string
  status: DailyStatus | null
  count: number
}
