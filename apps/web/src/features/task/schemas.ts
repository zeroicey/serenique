import { z } from 'zod'

// 任务组表单校验：标题必填（与后端 min(1).max(200) 对齐）。
export const taskGroupFormSchema = z.object({
  title: z.string().trim().min(1, '任务组名称不能为空').max(200, '任务组名称过长'),
})

export type TaskGroupFormValues = z.infer<typeof taskGroupFormSchema>

// 任务表单校验：标题必填。
export const taskFormSchema = z.object({
  title: z.string().trim().min(1, '任务内容不能为空').max(200, '任务内容过长'),
})

export type TaskFormValues = z.infer<typeof taskFormSchema>
