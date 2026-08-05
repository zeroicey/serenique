import { z } from 'zod'
import { todayUTC } from '@/lib/date'

// 日记表单校验：content 必填 + diaryDate 为 YYYY-MM-DD + 非未来日（UTC，与后端口径一致）。
export const diaryFormSchema = z
  .object({
    content: z.string().trim().min(1, '内容不能为空'),
    diaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  })
  .refine((v) => v.diaryDate <= todayUTC(), {
    path: ['diaryDate'],
    message: '不能创建未来日期的日记',
  })

export type DiaryFormValues = z.infer<typeof diaryFormSchema>
