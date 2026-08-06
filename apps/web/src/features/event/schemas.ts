import { z } from 'zod'

// 事件表单校验（RHF + zod）。startAt/endAt 为 datetime-local 字符串（YYYY-MM-DDTHH:mm）。
// end > start 前端先拦（guard 空值避免重复报错），后端 domain + DB CHECK 兜底。

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(200, '标题过长'),
    startAt: z.string().min(1, '请选择开始时间'),
    endAt: z.string().min(1, '请选择结束时间'),
    isAllDay: z.boolean(),
    location: z.string().trim().max(200, '地点过长').optional(),
    note: z.string().trim().max(2000, '备注过长').optional(),
  })
  .refine((v) => !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt), {
    path: ['endAt'],
    message: '结束时间必须晚于开始时间',
  })

export type EventFormValues = z.infer<typeof eventFormSchema>
