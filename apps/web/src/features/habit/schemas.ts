import { z } from 'zod'

// 习惯选项表单校验（RHF + zod）。
// sortOrder 用字符串承载（input value），提交时转数字；空串 = 默认 0。
// countable 切换只影响后续写入（服务端不回填历史），dialog 内有说明文案。

export const habitFormSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(100, '名称过长（最多 100 字）'),
  kind: z.enum(['good', 'bad'], { message: '请选择类型' }),
  countable: z.boolean(),
  sortOrder: z.string().trim().regex(/^\d*$/, '排序号须为非负整数').max(6, '排序号过长').optional(),
  description: z.string().trim().max(500, '简介过长（最多 500 字）').optional(),
})

export type HabitFormValues = z.infer<typeof habitFormSchema>
