import { z } from 'zod'

export const momentCreateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, '闪念内容不能为空')
    .max(500, '闪念最多 500 字'),
})

export type MomentCreateFormValues = z.infer<typeof momentCreateSchema>
