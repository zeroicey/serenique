import { z } from 'zod'
import { todayLocal } from '@/lib/date'

// 日记表单校验：content 必填 + diaryDate 为 YYYY-MM-DD + 非未来日（本地日期，与用户「今天」一致）。
// 注意：后端 `diary.domain.ts todayStr()` 仍用 UTC 判定未来日，凌晨（本地日期比 UTC 早一天）写
// 本地「今天」的日记会被后端以「未来日期」拒绝——这是待后端对齐的遗留问题（见 worklog）。
export const diaryFormSchema = z
  .object({
    content: z.string().trim().min(1, '内容不能为空'),
    diaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  })
  .refine((v) => v.diaryDate <= todayLocal(), {
    path: ['diaryDate'],
    message: '不能创建未来日期的日记',
  })

export type DiaryFormValues = z.infer<typeof diaryFormSchema>
