import { z } from 'zod'
import type { TaskStatus } from '@/modules/task/task.schema'

// ---------------------------------------------------------------------------
// Task module — request/response types
// ---------------------------------------------------------------------------

export const TaskStatusSchema = z.enum(['todo', 'done', 'abandon'])

/** YYYY-MM-DD 截止日期。存储为 text（见计划全局约束），字符串可直接字典序比较。 */
export const DueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '截止日期格式须为 YYYY-MM-DD')
  .refine((v) => {
    const parsed = Date.parse(`${v}T00:00:00Z`)
    // 部分引擎会把越界日期（如 2026-02-30）归一化而非返回 NaN，
    // 用往返校验兜底，确保是真实存在的日历日期。
    return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === v
  }, '截止日期无效')

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  groupId: z.string().uuid(),
  status: TaskStatusSchema.default('todo'),
  dueDate: DueDateSchema.optional(),
})

export const UpdateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    groupId: z.string().uuid().optional(),
    status: TaskStatusSchema.optional(),
    // "" 归一化为 null（清除），null 显式清除，缺省保持不变。
    dueDate: z
      .union([DueDateSchema, z.literal('')])
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.groupId !== undefined ||
      v.status !== undefined ||
      v.dueDate !== undefined,
    '至少需要提供一个待更新字段',
  )

export const ListTaskSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    groupId: z.string().uuid().optional(),
    status: TaskStatusSchema.optional(),
    dueDateFrom: DueDateSchema.optional(),
    dueDateTo: DueDateSchema.optional(),
  })
  .refine(
    (v) => v.dueDateFrom === undefined || v.dueDateTo === undefined || v.dueDateFrom <= v.dueDateTo,
    'dueDateFrom 不能晚于 dueDateTo',
  )

export const CreateTaskGroupSchema = z.object({
  title: z.string().trim().min(1).max(200),
})

export const ListTaskGroupSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

export const UpdateTaskGroupSchema = z.object({
  title: z.string().trim().min(1).max(200),
})

// ---- Input types (service layer) ------------------------------------------
// z.input keeps defaulted fields optional so MCP can pass bare objects.

export type CreateTaskInput = z.input<typeof CreateTaskSchema>
export type UpdateTaskInput = { id: string } & z.input<typeof UpdateTaskSchema>
// List inputs use z.infer: z.coerce produces an `unknown` input type for
// page/pageSize, so the parsed (number) type is what the service consumes.
export type ListTaskInput = z.infer<typeof ListTaskSchema>
export type GetTaskInput = { id: string }
export type DeleteTaskInput = { id: string }

export type CreateTaskGroupInput = z.input<typeof CreateTaskGroupSchema>
export type ListTaskGroupInput = z.infer<typeof ListTaskGroupSchema>
export type GetTaskGroupInput = { id: string }
export type UpdateTaskGroupInput = { id: string } & z.input<typeof UpdateTaskGroupSchema>
export type DeleteTaskGroupInput = { id: string }

// ---- Entry types (response layer) — times are ISO strings ---------------

export type TaskEntry = {
  id: string
  groupId: string
  title: string
  status: TaskStatus
  dueDate: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type TaskGroupEntry = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}
