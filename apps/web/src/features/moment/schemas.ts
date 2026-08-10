import { z } from 'zod'

// 对齐后端 MomentLocationSchema：name ≤128 / latitude -90..90 / longitude
// -180..180，均可选但至少一个字段；整体可 null（不传位置）。
export const momentLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.latitude !== undefined || v.longitude !== undefined,
    { message: '位置至少需要名称或坐标之一' },
  )

export const momentCreateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, '闪记内容不能为空')
    .max(10000, '闪记最多 10000 字'),
  location: momentLocationSchema.nullable().optional(),
})

export type MomentCreateFormValues = z.infer<typeof momentCreateSchema>
